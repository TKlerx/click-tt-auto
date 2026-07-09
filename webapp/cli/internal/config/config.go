package config

import (
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"runtime"
	"strings"
)

type Config struct {
	ServerURL string `json:"server_url"`
	Token     string `json:"token"`
}

func ConfigDir() string {
	if override := strings.TrimSpace(os.Getenv("STARTERCTL_CONFIG_DIR")); override != "" {
		return override
	}

	if runtime.GOOS == "windows" {
		if appData := strings.TrimSpace(os.Getenv("APPDATA")); appData != "" {
			return filepath.Join(appData, "starterctl")
		}
	}

	home, err := os.UserHomeDir()
	if err != nil {
		return "."
	}

	return filepath.Join(home, ".config", "starterctl")
}

func ConfigPath() string {
	return filepath.Join(ConfigDir(), "config.json")
}

func Load() (*Config, error) {
	cfg := &Config{}
	data, err := os.ReadFile(ConfigPath())
	if err == nil {
		if err := json.Unmarshal(data, cfg); err != nil {
			return nil, err
		}
	} else if !errors.Is(err, os.ErrNotExist) {
		return nil, err
	}

	applyEnvOverrides(cfg)
	return cfg, nil
}

func Save(cfg *Config) error {
	if cfg == nil {
		cfg = &Config{}
	}
	if err := os.MkdirAll(ConfigDir(), 0o700); err != nil {
		return err
	}
	data, err := json.MarshalIndent(cfg, "", "  ")
	if err != nil {
		return err
	}
	if err := os.WriteFile(ConfigPath(), append(data, '\n'), 0o600); err != nil {
		return err
	}
	return os.Chmod(ConfigPath(), 0o600)
}

func Clear() error {
	if err := os.Remove(ConfigPath()); err != nil && !errors.Is(err, os.ErrNotExist) {
		return err
	}
	return nil
}

func applyEnvOverrides(cfg *Config) {
	if value := strings.TrimSpace(os.Getenv("STARTERCTL_SERVER_URL")); value != "" {
		cfg.ServerURL = value
	}
	if value := strings.TrimSpace(os.Getenv("STARTERCTL_TOKEN")); value != "" {
		cfg.Token = value
	}
}
