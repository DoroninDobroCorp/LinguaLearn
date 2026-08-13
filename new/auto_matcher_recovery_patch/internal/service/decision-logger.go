package service

import (
	"bufio"
	"encoding/json"
	"fmt"
	"os"
	"sync"
	"time"
)

type MatchingDecision struct {
	Timestamp    time.Time
	Stage        string
	EntityType   string
	Sport        string
	Bookmaker1   string
	Bookmaker2   string
	Item1Name    string
	Item2Name    string
	Item1ID      int64
	Item2ID      int64
	SampleTeams1 []string
	SampleTeams2 []string
	Decision     bool
	Reason       string
	LLMProvider  string
}

type DecisionLogger struct {
	logFilePath string
	mutex       sync.Mutex
}

func NewDecisionLogger(logFilePath string) (*DecisionLogger, error) {
	dir := "logs"
	if err := os.MkdirAll(dir, 0755); err != nil {
		return nil, fmt.Errorf("failed to create logs directory: %w", err)
	}
	return &DecisionLogger{logFilePath: logFilePath}, nil
}

func (dl *DecisionLogger) LogDecision(decision MatchingDecision) error {
	dl.mutex.Lock()
	defer dl.mutex.Unlock()

	file, err := os.OpenFile(dl.logFilePath, os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0644)
	if err != nil {
		return fmt.Errorf("failed to open log file: %w", err)
	}
	defer file.Close()

	data, err := json.Marshal(decision)
	if err != nil {
		return fmt.Errorf("failed to marshal decision: %w", err)
	}

	_, err = file.Write(append(data, '\n'))
	return err
}

// GetRecentDecisions returns the last n decisions from the log file
func (dl *DecisionLogger) GetRecentDecisions(limit int) ([]MatchingDecision, error) {
	dl.mutex.Lock()
	defer dl.mutex.Unlock()

	file, err := os.Open(dl.logFilePath)
	if err != nil {
		if os.IsNotExist(err) {
			return []MatchingDecision{}, nil
		}
		return nil, fmt.Errorf("failed to open log file: %w", err)
	}
	defer file.Close()

	var decisions []MatchingDecision
	scanner := bufio.NewScanner(file)
	scanner.Buffer(make([]byte, 0, 64*1024), 1024*1024) // up to 1MB lines
	for scanner.Scan() {
		var d MatchingDecision
		if err := json.Unmarshal(scanner.Bytes(), &d); err != nil {
			continue // Skip malformed lines
		}
		decisions = append(decisions, d)
	}

	if err := scanner.Err(); err != nil {
		return nil, fmt.Errorf("error reading log file: %w", err)
	}

	// Return last n decisions
	if len(decisions) > limit {
		decisions = decisions[len(decisions)-limit:]
	}

	// Reverse to show newest first
	for i, j := 0, len(decisions)-1; i < j; i, j = i+1, j-1 {
		decisions[i], decisions[j] = decisions[j], decisions[i]
	}

	return decisions, nil
}
