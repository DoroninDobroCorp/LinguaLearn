package service

import (
	"bufio"
	"encoding/json"
	"fmt"
	"livebets/auto_matcher/internal/entity"
	"os"
	"path/filepath"
	"sync"
	"time"

	"github.com/google/uuid"
)

type PendingPairManager struct {
	leagueFilePath string
	teamFilePath   string
	mutex          sync.Mutex
}

func newPendingPairManagerIfEnabled(enabled bool, logsDir string) (*PendingPairManager, error) {
	if !enabled {
		return nil, nil
	}
	return NewPendingPairManager(logsDir)
}

func NewPendingPairManager(logsDir string) (*PendingPairManager, error) {
	if err := os.MkdirAll(logsDir, 0755); err != nil {
		return nil, fmt.Errorf("failed to create logs directory: %w", err)
	}

	return &PendingPairManager{
		leagueFilePath: filepath.Join(logsDir, "pending_league_pairs.jsonl"),
		teamFilePath:   filepath.Join(logsDir, "pending_team_pairs.jsonl"),
	}, nil
}

// SavePendingLeaguePair - сохраняет лигу в очередь на ручную проверку
func (pm *PendingPairManager) SavePendingLeaguePair(pair entity.PendingLeaguePair) error {
	pm.mutex.Lock()
	defer pm.mutex.Unlock()

	// Генерируем UUID если не задан
	if pair.ID == "" {
		pair.ID = uuid.New().String()
	}
	if pair.Timestamp.IsZero() {
		pair.Timestamp = time.Now()
	}
	if pair.Status == "" {
		pair.Status = "pending"
	}

	file, err := os.OpenFile(pm.leagueFilePath, os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0644)
	if err != nil {
		return fmt.Errorf("failed to open league file: %w", err)
	}
	defer file.Close()

	data, err := json.Marshal(pair)
	if err != nil {
		return fmt.Errorf("failed to marshal league pair: %w", err)
	}

	_, err = file.Write(append(data, '\n'))
	return err
}

// SavePendingTeamPair - сохраняет команду в очередь на ручную проверку
func (pm *PendingPairManager) SavePendingTeamPair(pair entity.PendingTeamPair) error {
	pm.mutex.Lock()
	defer pm.mutex.Unlock()

	if pair.ID == "" {
		pair.ID = uuid.New().String()
	}
	if pair.Timestamp.IsZero() {
		pair.Timestamp = time.Now()
	}
	if pair.Status == "" {
		pair.Status = "pending"
	}

	file, err := os.OpenFile(pm.teamFilePath, os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0644)
	if err != nil {
		return fmt.Errorf("failed to open team file: %w", err)
	}
	defer file.Close()

	data, err := json.Marshal(pair)
	if err != nil {
		return fmt.Errorf("failed to marshal team pair: %w", err)
	}

	_, err = file.Write(append(data, '\n'))
	return err
}

// GetPendingLeaguePairs - получить все pending пары лиг
func (pm *PendingPairManager) GetPendingLeaguePairs(status string) ([]entity.PendingLeaguePair, error) {
	pm.mutex.Lock()
	defer pm.mutex.Unlock()

	file, err := os.Open(pm.leagueFilePath)
	if err != nil {
		if os.IsNotExist(err) {
			return []entity.PendingLeaguePair{}, nil
		}
		return nil, fmt.Errorf("failed to open league file: %w", err)
	}
	defer file.Close()

	var pairs []entity.PendingLeaguePair
	scanner := bufio.NewScanner(file)
	scanner.Buffer(make([]byte, 0, 64*1024), 1024*1024)
	for scanner.Scan() {
		var pair entity.PendingLeaguePair
		if err := json.Unmarshal(scanner.Bytes(), &pair); err != nil {
			continue
		}
		if status == "" || pair.Status == status {
			pairs = append(pairs, pair)
		}
	}

	return pairs, scanner.Err()
}

// GetPendingTeamPairs - получить все pending пары команд
func (pm *PendingPairManager) GetPendingTeamPairs(status string) ([]entity.PendingTeamPair, error) {
	pm.mutex.Lock()
	defer pm.mutex.Unlock()

	file, err := os.Open(pm.teamFilePath)
	if err != nil {
		if os.IsNotExist(err) {
			return []entity.PendingTeamPair{}, nil
		}
		return nil, fmt.Errorf("failed to open team file: %w", err)
	}
	defer file.Close()

	var pairs []entity.PendingTeamPair
	scanner := bufio.NewScanner(file)
	scanner.Buffer(make([]byte, 0, 64*1024), 1024*1024)
	for scanner.Scan() {
		var pair entity.PendingTeamPair
		if err := json.Unmarshal(scanner.Bytes(), &pair); err != nil {
			continue
		}
		if status == "" || pair.Status == status {
			pairs = append(pairs, pair)
		}
	}

	return pairs, scanner.Err()
}

// UpdateLeaguePairStatus - обновить статус пары лиг (approve/reject)
func (pm *PendingPairManager) UpdateLeaguePairStatus(id, newStatus, reviewedBy, rejectReason string) error {
	pm.mutex.Lock()
	defer pm.mutex.Unlock()

	pairs, err := pm.readAllLeaguePairs()
	if err != nil {
		return err
	}

	found := false
	for i, pair := range pairs {
		if pair.ID == id {
			pairs[i].Status = newStatus
			pairs[i].ReviewedBy = reviewedBy
			pairs[i].ReviewedAt = time.Now()
			pairs[i].RejectReason = rejectReason
			found = true
			break
		}
	}

	if !found {
		return fmt.Errorf("league pair with ID %s not found", id)
	}

	return pm.writeAllLeaguePairs(pairs)
}

// UpdateTeamPairStatus - обновить статус пары команд
func (pm *PendingPairManager) UpdateTeamPairStatus(id, newStatus, reviewedBy, rejectReason string) error {
	pm.mutex.Lock()
	defer pm.mutex.Unlock()

	pairs, err := pm.readAllTeamPairs()
	if err != nil {
		return err
	}

	found := false
	for i, pair := range pairs {
		if pair.ID == id {
			pairs[i].Status = newStatus
			pairs[i].ReviewedBy = reviewedBy
			pairs[i].ReviewedAt = time.Now()
			pairs[i].RejectReason = rejectReason
			found = true
			break
		}
	}

	if !found {
		return fmt.Errorf("team pair with ID %s not found", id)
	}

	return pm.writeAllTeamPairs(pairs)
}

// Вспомогательные методы для чтения/записи всех пар
func (pm *PendingPairManager) readAllLeaguePairs() ([]entity.PendingLeaguePair, error) {
	file, err := os.Open(pm.leagueFilePath)
	if err != nil {
		if os.IsNotExist(err) {
			return []entity.PendingLeaguePair{}, nil
		}
		return nil, err
	}
	defer file.Close()

	var pairs []entity.PendingLeaguePair
	scanner := bufio.NewScanner(file)
	scanner.Buffer(make([]byte, 0, 64*1024), 1024*1024)
	for scanner.Scan() {
		var pair entity.PendingLeaguePair
		if err := json.Unmarshal(scanner.Bytes(), &pair); err != nil {
			continue
		}
		pairs = append(pairs, pair)
	}

	return pairs, scanner.Err()
}

func (pm *PendingPairManager) readAllTeamPairs() ([]entity.PendingTeamPair, error) {
	file, err := os.Open(pm.teamFilePath)
	if err != nil {
		if os.IsNotExist(err) {
			return []entity.PendingTeamPair{}, nil
		}
		return nil, err
	}
	defer file.Close()

	var pairs []entity.PendingTeamPair
	scanner := bufio.NewScanner(file)
	scanner.Buffer(make([]byte, 0, 64*1024), 1024*1024)
	for scanner.Scan() {
		var pair entity.PendingTeamPair
		if err := json.Unmarshal(scanner.Bytes(), &pair); err != nil {
			continue
		}
		pairs = append(pairs, pair)
	}

	return pairs, scanner.Err()
}

func (pm *PendingPairManager) writeAllLeaguePairs(pairs []entity.PendingLeaguePair) error {
	tmpPath := pm.leagueFilePath + ".tmp"
	file, err := os.Create(tmpPath)
	if err != nil {
		return err
	}

	for _, pair := range pairs {
		data, err := json.Marshal(pair)
		if err != nil {
			file.Close()
			os.Remove(tmpPath)
			return fmt.Errorf("failed to marshal league pair: %w", err)
		}
		if _, err := file.Write(append(data, '\n')); err != nil {
			file.Close()
			os.Remove(tmpPath)
			return fmt.Errorf("failed to write league pair: %w", err)
		}
	}

	if err := file.Sync(); err != nil {
		file.Close()
		os.Remove(tmpPath)
		return err
	}
	file.Close()
	return os.Rename(tmpPath, pm.leagueFilePath)
}

func (pm *PendingPairManager) writeAllTeamPairs(pairs []entity.PendingTeamPair) error {
	tmpPath := pm.teamFilePath + ".tmp"
	file, err := os.Create(tmpPath)
	if err != nil {
		return err
	}

	for _, pair := range pairs {
		data, err := json.Marshal(pair)
		if err != nil {
			file.Close()
			os.Remove(tmpPath)
			return fmt.Errorf("failed to marshal team pair: %w", err)
		}
		if _, err := file.Write(append(data, '\n')); err != nil {
			file.Close()
			os.Remove(tmpPath)
			return fmt.Errorf("failed to write team pair: %w", err)
		}
	}

	if err := file.Sync(); err != nil {
		file.Close()
		os.Remove(tmpPath)
		return err
	}
	file.Close()
	return os.Rename(tmpPath, pm.teamFilePath)
}

// GetLeaguePairByID - получить конкретную пару по ID
func (pm *PendingPairManager) GetLeaguePairByID(id string) (*entity.PendingLeaguePair, error) {
	pairs, err := pm.GetPendingLeaguePairs("")
	if err != nil {
		return nil, err
	}

	for _, pair := range pairs {
		if pair.ID == id {
			return &pair, nil
		}
	}

	return nil, fmt.Errorf("league pair with ID %s not found", id)
}

// GetTeamPairByID - получить конкретную пару команд по ID
func (pm *PendingPairManager) GetTeamPairByID(id string) (*entity.PendingTeamPair, error) {
	pairs, err := pm.GetPendingTeamPairs("")
	if err != nil {
		return nil, err
	}

	for _, pair := range pairs {
		if pair.ID == id {
			return &pair, nil
		}
	}

	return nil, fmt.Errorf("team pair with ID %s not found", id)
}
