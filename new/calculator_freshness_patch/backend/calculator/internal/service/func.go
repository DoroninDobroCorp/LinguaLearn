package service

import (
	"bytes"
	"encoding/json"
	"fmt"
	"livebets/calculator/internal/entity"
	"net/http"
	"regexp"
	"strings"
	"time"
)

var reSpecialChars = regexp.MustCompile(`[^a-zA-Z0-9_<>-]`)

func removeSpecialChars(input string) string {
	return reSpecialChars.ReplaceAllString(input, "")
}

func replaceDotsInFileName(fileName string) string {
	return strings.ReplaceAll(fileName, ".", "-")
}

func normalizeTime(recordTime time.Time, minutes, seconds int, isLive bool) time.Time {
	hour := recordTime.Hour()
	recordMinutes := recordTime.Minute()

	// Обработка перехода через час:
	// Если минуты ввода меньше минут записи на 30+, значит это следующий час
	// Например: recordTime = 14:58, ввод = 02:30 -> должно быть 15:02:30
	if recordMinutes > 30 && minutes < 30 && (recordMinutes-minutes) > 30 {
		hour = (hour + 1) % 24
	}
	// Обратный случай: если минуты ввода больше минут записи на 30+, значит это предыдущий час
	// Например: recordTime = 15:02, ввод = 58:30 -> должно быть 14:58:30
	if recordMinutes < 30 && minutes > 30 && (minutes-recordMinutes) > 30 {
		hour = (hour - 1 + 24) % 24
	}

	resultTime := time.Date(
		recordTime.Year(),
		recordTime.Month(),
		recordTime.Day(),
		hour,
		minutes,
		seconds,
		recordTime.Nanosecond(),
		recordTime.Location(),
	)

	if isLive {
		resultTime = resultTime.Add(5 * time.Second)
	} else {
		resultTime = resultTime.Add(18 * time.Minute)
	}

	return resultTime
}

func getPriceForSecond(priceRecords *entity.ResponsePriceRecords, recordTime time.Time, minutes, seconds int, isLive bool, coef float64) float64 {
	searchTime := normalizeTime(recordTime, minutes, seconds, isLive)

	for _, record := range priceRecords.Records {
		if record.Second.CreatedAt == searchTime {
			return record.Second.Score
		}
	}

	return coef
}

func sendMissedBet(pair entity.PairOneOutcome, keyMatch string) error {
	url := "http://tg_manager:7020/missed_bet"

	requestBody := entity.MissedBet{
		KeyMatch: keyMatch,
		Pair:     pair,
	}

	jsonBody, err := json.Marshal(requestBody)
	if err != nil {
		return fmt.Errorf("failed to marshal request body: %w", err)
	}

	req, err := http.NewRequest(http.MethodPost, url, bytes.NewBuffer(jsonBody))
	if err != nil {
		return fmt.Errorf("failed to create request: %w", err)
	}

	req.Header.Set("Content-Type", "application/json")

	client := &http.Client{
		Timeout: 10 * time.Second,
	}

	resp, err := client.Do(req)
	if err != nil {
		return fmt.Errorf("failed to send request: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("unexpected status code: %d", resp.StatusCode)
	}

	return nil
}
