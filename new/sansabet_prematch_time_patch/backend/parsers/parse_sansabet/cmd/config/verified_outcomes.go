package config

import (
	"fmt"
	"log"
	"os"
	"path/filepath"
	"strings"

	"gopkg.in/yaml.v2"
)

// VerifiedOutcomesConfig - конфигурация проверенных типов рынков
type VerifiedOutcomesConfig struct {
	Soccer            SportVerification            `yaml:"soccer"`
	Hockey            SportVerification            `yaml:"hockey"`
	Basketball        SportVerification            `yaml:"basketball"`
	Tennis            SportVerification            `yaml:"tennis"`
	Volleyball        SportVerification            `yaml:"volleyball"`
	Handball          SportVerification            `yaml:"handball"`
	Esports           SportVerification            `yaml:"esports"`
	MarketNameMapping map[string]map[string]string `yaml:"market_name_mapping"`
}

// SportVerification - проверенные и пропускаемые типы рынков для спорта
type SportVerification struct {
	VerifiedMarketTypes []string `yaml:"verified_market_types"`
	SkippedMarketTypes  []string `yaml:"skipped_market_types"`
}

// LoadVerifiedOutcomes - загрузка конфига из YAML файла
func LoadVerifiedOutcomes(configPath string) (*VerifiedOutcomesConfig, error) {
	data, err := os.ReadFile(configPath)
	if err != nil {
		return nil, fmt.Errorf("failed to read config file: %w", err)
	}

	var config VerifiedOutcomesConfig
	if err := yaml.Unmarshal(data, &config); err != nil {
		return nil, fmt.Errorf("failed to parse YAML: %w", err)
	}

	log.Printf("✅ Loaded verified outcomes config from %s", configPath)
	logStats(&config)

	return &config, nil
}

// LoadVerifiedOutcomesDefault - загрузка конфига из нескольких типовых путей
func LoadVerifiedOutcomesDefault() (*VerifiedOutcomesConfig, error) {
	paths := []string{}
	if envPath := strings.TrimSpace(os.Getenv("VERIFIED_OUTCOMES_PATH")); envPath != "" {
		paths = append(paths, envPath)
	}
	paths = append(paths,
		filepath.Join("configs", "verified_outcomes.yml"),
		filepath.Join(".", "verified_outcomes.yml"),
	)
	if exePath, err := os.Executable(); err == nil {
		paths = append(paths, filepath.Join(filepath.Dir(exePath), "verified_outcomes.yml"))
	}

	for _, path := range paths {
		if fileExists(path) {
			return LoadVerifiedOutcomes(path)
		}
	}

	return nil, fmt.Errorf("verified outcomes config not found (tried: %s)", strings.Join(paths, ", "))
}

func fileExists(path string) bool {
	if path == "" {
		return false
	}
	info, err := os.Stat(path)
	if err != nil {
		return false
	}
	return !info.IsDir()
}

func logStats(config *VerifiedOutcomesConfig) {
	sports := map[string]SportVerification{
		"Soccer":     config.Soccer,
		"Hockey":     config.Hockey,
		"Basketball": config.Basketball,
		"Tennis":     config.Tennis,
		"Volleyball": config.Volleyball,
		"Handball":   config.Handball,
		"Esports":   config.Esports,
	}

	for name, sport := range sports {
		verified := len(sport.VerifiedMarketTypes)
		skipped := len(sport.SkippedMarketTypes)
		if verified > 0 || skipped > 0 {
			log.Printf("  %s: %d verified, %d skipped", name, verified, skipped)
		}
	}
}

// IsMarketVerified - проверка, нужно ли парсить этот рынок
// For Sansabet: marketType is the market type name (Win1x2, Totals, etc.)
// determined from TipID in the parser code
func (c *VerifiedOutcomesConfig) IsMarketVerified(sportID string, marketType string) bool {
	// Нормализуем sport ID в название спорта
	sportKey := normalizeSportID(sportID)

	// Получаем конфиг для спорта
	sportConfig := c.getSportConfig(sportKey)
	if sportConfig == nil {
		return false
	}

	// Проверяем, есть ли этот тип в verified списке
	for _, verified := range sportConfig.VerifiedMarketTypes {
		if verified == marketType {
			return true
		}
	}

	return false
}

func (c *VerifiedOutcomesConfig) getSportConfig(sportKey string) *SportVerification {
	switch sportKey {
	case "soccer":
		return &c.Soccer
	case "hockey":
		return &c.Hockey
	case "basketball":
		return &c.Basketball
	case "tennis":
		return &c.Tennis
	case "volleyball":
		return &c.Volleyball
	case "handball":
		return &c.Handball
	case "esports":
		return &c.Esports
	default:
		return nil
	}
}

func normalizeSportID(sportID string) string {
	// Sansabet использует ID: "1" = Soccer, "2" = Basketball, "3" = Tennis, etc.
	// Маппинг в lowercase названия
	sportMap := map[string]string{
		"1":  "soccer",
		"2":  "basketball",
		"3":  "tennis",
		"4":  "volleyball",
		"5":  "hockey",
		"6":  "americanfootball",
		"7":  "baseball",
		"8":  "handball",
		"9":  "tabletennis",
		"10": "rugby",
		"H":  "handball",
		"F":  "soccer",
		"B":  "basketball",
		"T":  "tennis",
		"V":  "volleyball",
		"IH": "hockey",
		"AF": "americanfootball",
		"BB": "baseball",
	}

	if name, ok := sportMap[sportID]; ok {
		return name
	}

	// Fallback: если уже строка, приводим к lowercase
	return strings.ToLower(sportID)
}
