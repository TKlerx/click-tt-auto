package update

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"golang.org/x/term"
)

const latestReleaseURL = "https://api.github.com/repos/TKlerx/webapp-template/releases/latest"

type Config struct {
	CurrentVersion string
	Stderr         io.Writer
}

type Checker struct {
	config Config
	mu     sync.Mutex
	done   bool
	msg    string
}

type cachePayload struct {
	LatestVersion string    `json:"latest_version"`
	CheckedAt     time.Time `json:"checked_at"`
}

type checkerContextKey string

const contextKey checkerContextKey = "update-checker"

func NewChecker(config Config) *Checker {
	if config.Stderr == nil {
		config.Stderr = os.Stderr
	}
	return &Checker{config: config}
}

func (c *Checker) Start() {
	go c.run()
}

func (c *Checker) Result() (string, bool) {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.msg, c.done
}

func (c *Checker) run() {
	message, _ := checkForUpdate(c.config.CurrentVersion)
	c.mu.Lock()
	c.msg = message
	c.done = true
	c.mu.Unlock()
}

func IsInteractive() bool {
	return term.IsTerminal(int(os.Stdout.Fd()))
}

func WithChecker(ctx context.Context, checker *Checker) context.Context {
	return context.WithValue(ctx, contextKey, checker)
}

func FromContext(ctx context.Context) *Checker {
	if ctx == nil {
		return nil
	}
	checker, _ := ctx.Value(contextKey).(*Checker)
	return checker
}

func checkForUpdate(currentVersion string) (string, error) {
	if currentVersion == "" || currentVersion == "dev" {
		return "", nil
	}

	cached, ok := readCache()
	if ok && time.Since(cached.CheckedAt) < 24*time.Hour {
		return renderMessage(currentVersion, cached.LatestVersion), nil
	}

	req, err := http.NewRequest(http.MethodGet, latestReleaseURL, nil)
	if err != nil {
		return "", err
	}
	req.Header.Set("Accept", "application/vnd.github+json")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return "", fmt.Errorf("release check failed with status %d", resp.StatusCode)
	}

	var body struct {
		TagName string `json:"tag_name"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&body); err != nil {
		return "", err
	}

	latest := strings.TrimPrefix(body.TagName, "cli-v")
	writeCache(cachePayload{LatestVersion: latest, CheckedAt: time.Now().UTC()})
	return renderMessage(currentVersion, latest), nil
}

func renderMessage(currentVersion string, latestVersion string) string {
	if latestVersion == "" || latestVersion == currentVersion {
		return ""
	}
	return fmt.Sprintf("A newer starterctl version is available: %s (current %s)", latestVersion, currentVersion)
}

func cachePath() string {
	configDir := os.Getenv("STARTERCTL_CONFIG_DIR")
	if strings.TrimSpace(configDir) == "" {
		home, err := os.UserHomeDir()
		if err != nil {
			return "version-check.json"
		}
		configDir = filepath.Join(home, ".config", "starterctl")
	}
	return filepath.Join(configDir, "version-check.json")
}

func readCache() (cachePayload, bool) {
	data, err := os.ReadFile(cachePath())
	if err != nil {
		return cachePayload{}, false
	}
	var payload cachePayload
	if err := json.Unmarshal(data, &payload); err != nil {
		return cachePayload{}, false
	}
	return payload, true
}

func writeCache(payload cachePayload) {
	data, err := json.MarshalIndent(payload, "", "  ")
	if err != nil {
		return
	}
	path := cachePath()
	if err := os.MkdirAll(filepath.Dir(path), 0o700); err != nil {
		return
	}
	_ = os.WriteFile(path, append(data, '\n'), 0o600)
}
