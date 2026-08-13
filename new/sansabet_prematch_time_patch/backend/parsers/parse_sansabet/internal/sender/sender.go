package sender

import (
	"context"
	"encoding/json"
	"livebets/parse_sansabet/cmd/config"
	"livebets/parse_sansabet/internal/entity"
	"log"
	"net/http"
	"sync"
	"time"

	"github.com/gorilla/websocket"
)

type Sender struct {
	cfg            config.SenderConfig
	analyzerConn   *websocket.Conn
	clientConns    map[*websocket.Conn]bool
	clientConnsMux sync.Mutex
	sendChan       <-chan entity.ResponseGame
	upgrader       websocket.Upgrader
	reconnectCount int
	lastReconnect  time.Time
	messagesSent   int64
	messagesDropped int64
}

func NewSender(cfg config.SenderConfig, sendChan <-chan entity.ResponseGame) *Sender {
	analyzerConn := connectToAnalyzer(cfg)

	upgrader := websocket.Upgrader{
		CheckOrigin: func(r *http.Request) bool {
			return true
		},
	}

	return &Sender{
		cfg:          cfg,
		analyzerConn: analyzerConn,
		clientConns:  make(map[*websocket.Conn]bool),
		sendChan:     sendChan,
		upgrader:     upgrader,
	}
}

func NewSenderWithBroadcast(cfg config.SenderConfig, sendChan <-chan entity.ResponseGame) *Sender {
	return NewSender(cfg, sendChan)
}

// connectToAnalyzer устанавливает WebSocket соединение с Analyzer
// 
// ВАЖНО: URL должен содержать API key в query параметре
// Пример: ws://analyzer:7100?api_key=sansabet_secret_key_change_in_production
//
// Для Docker: используйте имя контейнера "analyzer"
// Для локальной отладки: используйте "localhost"
//
// Analyzer проверяет API key через:
// 1. Query параметр ?api_key=... (используется здесь)
// 2. HTTP header X-API-Key
// dialAnalyzerOnce makes a single connection attempt, returns nil on failure
func dialAnalyzerOnce(cfg config.SenderConfig) *websocket.Conn {
	conn, _, err := websocket.DefaultDialer.Dial(cfg.Url, nil)
	if err != nil {
		log.Printf("[ERROR] Ошибка подключения к анализатору: %v", err)
		return nil
	}
	log.Printf("[SUCCESS] Подключено к анализатору: %s", cfg.Url)

	// Start background read loop to handle ping/pong and keep connection alive
	go func(c *websocket.Conn) {
		for {
			if _, _, err := c.ReadMessage(); err != nil {
				return // Connection closed
			}
		}
	}(conn)

	return conn
}

func connectToAnalyzer(cfg config.SenderConfig) *websocket.Conn {
	for {
		conn := dialAnalyzerOnce(cfg)
		if conn != nil {
			return conn
		}
		log.Printf("[INFO] Проверьте: 1) Analyzer запущен, 2) URL правильный, 3) API key совпадает")
		time.Sleep(5 * time.Second)
	}
}

// reconnectAnalyzerWithBackoff пытается переподключиться к Analyzer с экспоненциальной задержкой
// Не завершает процесс - пытается восстановить соединение автоматически
func (s *Sender) reconnectAnalyzerWithBackoff(ctx context.Context) {
	backoff := 2 * time.Second
	maxBackoff := 60 * time.Second
	attempt := 0

	for {
		if ctx.Err() != nil {
			log.Printf("[SANSABET][RECONNECT] context cancelled, stop reconnect attempts")
			return
		}

		attempt++
		s.reconnectCount++
		log.Printf("[SANSABET][RECONNECT] attempt #%d (total reconnects: %d) at %s", 
			attempt, s.reconnectCount, time.Now().Format("15:04:05"))

		conn := dialAnalyzerOnce(s.cfg)
		if conn != nil {
			s.lastReconnect = time.Now()
			log.Printf("[SANSABET][RECONNECT] ✅ analyzer connection restored after %d attempts (total: %d reconnects)", 
				attempt, s.reconnectCount)
			log.Printf("[SANSABET][STATS] messages sent: %d, dropped: %d", s.messagesSent, s.messagesDropped)
			s.analyzerConn = conn
			return
		}

		log.Printf("[SANSABET][RECONNECT] ❌ failed to reconnect, retry in %s", backoff)
		select {
		case <-time.After(backoff):
			if backoff < maxBackoff {
				backoff *= 2
				if backoff > maxBackoff {
					backoff = maxBackoff
				}
			}
		case <-ctx.Done():
			log.Printf("[SANSABET][RECONNECT] context cancelled while waiting, stop reconnect attempts")
			return
		}
	}
}

// SendingToAnalyzer - живучий бесконечный цикл отправки в Analyzer
// - не завершает процесс при ошибках соединения
// - автоматически переподключается с экспоненциальной задержкой
// - логирует статистику отправки и переподключений
// - выходит только по ctx.Done() (graceful shutdown)
func (s *Sender) SendingToAnalyzer(ctx context.Context, wg *sync.WaitGroup) error {
	defer wg.Done()
	
	log.Printf("[SANSABET][SENDER] started, initial connection: %v", s.analyzerConn != nil)

	for {
		select {
		case <-ctx.Done():
			log.Printf("[SANSABET][SENDER] graceful shutdown requested")
			log.Printf("[SANSABET][STATS] final stats - sent: %d, dropped: %d, reconnects: %d", 
				s.messagesSent, s.messagesDropped, s.reconnectCount)
			s.clientConnsMux.Lock()
			for conn := range s.clientConns {
				conn.Close()
				delete(s.clientConns, conn)
			}
			s.clientConnsMux.Unlock()
			if s.analyzerConn != nil {
				s.analyzerConn.Close()
			}
			return nil

		case data, ok := <-s.sendChan:
			if !ok {
				log.Printf("[SANSABET][SENDER] sendChan closed, stopping sender loop")
				return nil
			}

			byteMsg, err := json.Marshal(data)
			if err != nil {
				log.Printf("[SANSABET][ERROR] marshal error: %v", err)
				s.messagesDropped++
				continue
			}

			// Гарантируем активное соединение с analyzer
			if s.analyzerConn == nil {
				log.Printf("[SANSABET][WARN] analyzerConn is nil at %s, reconnecting...", time.Now().Format("15:04:05"))
				s.reconnectAnalyzerWithBackoff(ctx)
			}

			if s.analyzerConn != nil {
				if err := s.analyzerConn.WriteMessage(websocket.TextMessage, byteMsg); err != nil {
					log.Printf("[SANSABET][ERROR] write failed at %s (%v): %v", 
						time.Now().Format("15:04:05"), s.analyzerConn.RemoteAddr(), err)
					_ = s.analyzerConn.Close()
					s.analyzerConn = nil
					s.messagesDropped++

					// Пытаемся переподключиться с экспоненциальной задержкой
					// Парсер продолжит работу после восстановления соединения
					log.Printf("[SANSABET][INFO] attempting automatic reconnection...")
					s.reconnectAnalyzerWithBackoff(ctx)

					// После переподключения следующая итерация цикла отправит новые данные
				} else {
					s.messagesSent++
					// Периодически выводим статистику (каждые 1000 сообщений)
					if s.messagesSent%1000 == 0 {
						log.Printf("[SANSABET][STATS] messages sent: %d, dropped: %d, reconnects: %d", 
							s.messagesSent, s.messagesDropped, s.reconnectCount)
					}
				}
			} else {
				s.messagesDropped++
				log.Printf("[SANSABET][ERROR] analyzerConn is still nil after reconnect attempts at %s, message dropped (total dropped: %d)", 
					time.Now().Format("15:04:05"), s.messagesDropped)
			}

			// BROADCAST: отправка всем подключенным клиентам (для отладки/мониторинга)
			s.sendingToClients(byteMsg)
		}
	}
}

// HandleClientConn обрабатывает новое WebSocket соединение от клиента
func (s *Sender) HandleClientConn(w http.ResponseWriter, r *http.Request) {
	conn, err := s.upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("[ERROR] Ошибка при обновлении соединения до WebSocket: %v", err)
		return
	}

	s.clientConnsMux.Lock()
	s.clientConns[conn] = true
	s.clientConnsMux.Unlock()

	log.Printf("[INFO] Новый клиент подключен к Sansabet: %s", conn.RemoteAddr())

	go func() {
		defer func() {
			s.clientConnsMux.Lock()
			delete(s.clientConns, conn)
			s.clientConnsMux.Unlock()
			conn.Close()
			log.Printf("[INFO] Клиент отключен от Sansabet: %s", conn.RemoteAddr())
		}()

		for {
			_, _, err := conn.ReadMessage()
			if err != nil {
				if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseAbnormalClosure) {
					log.Printf("[ERROR] Ошибка чтения от клиента: %v", err)
				}
				return
			}
		}
	}()
}

// sendingToClients отправляет данные всем подключенным клиентам
func (s *Sender) sendingToClients(byteMsg []byte) {
	// Snapshot connections under lock, then write without holding lock
	s.clientConnsMux.Lock()
	snapshot := make([]*websocket.Conn, 0, len(s.clientConns))
	for conn := range s.clientConns {
		snapshot = append(snapshot, conn)
	}
	s.clientConnsMux.Unlock()

	var failed []*websocket.Conn
	for _, conn := range snapshot {
		if err := conn.WriteMessage(websocket.TextMessage, byteMsg); err != nil {
			log.Printf("[ERROR] Ошибка отправки данных клиенту (%v): %v", conn.RemoteAddr(), err)
			conn.Close()
			failed = append(failed, conn)
		}
	}

	if len(failed) > 0 {
		s.clientConnsMux.Lock()
		for _, conn := range failed {
			delete(s.clientConns, conn)
		}
		s.clientConnsMux.Unlock()
	}
}
