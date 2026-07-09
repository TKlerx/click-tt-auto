package tests

import (
	"os"
	"path/filepath"
	"runtime"
	"testing"

	"github.com/stretchr/testify/require"

	"github.com/TKlerx/webapp-template/cli/internal/config"
)

func TestLoadSaveClearAndEnvOverrides(t *testing.T) {
	tempDir := t.TempDir()
	t.Setenv("STARTERCTL_CONFIG_DIR", tempDir)
	t.Setenv("STARTERCTL_SERVER_URL", "")
	t.Setenv("STARTERCTL_TOKEN", "")

	cfg := &config.Config{
		ServerURL: "https://example.com/app",
		Token:     "token-1",
	}
	require.NoError(t, config.Save(cfg))

	loaded, err := config.Load()
	require.NoError(t, err)
	require.Equal(t, cfg.ServerURL, loaded.ServerURL)
	require.Equal(t, cfg.Token, loaded.Token)

	t.Setenv("STARTERCTL_SERVER_URL", "https://override.example.com")
	t.Setenv("STARTERCTL_TOKEN", "override-token")
	loaded, err = config.Load()
	require.NoError(t, err)
	require.Equal(t, "https://override.example.com", loaded.ServerURL)
	require.Equal(t, "override-token", loaded.Token)

	require.NoError(t, config.Clear())
	_, err = os.Stat(filepath.Join(tempDir, "config.json"))
	require.Error(t, err)
}

func TestConfigDirUsesPlatformConventions(t *testing.T) {
	t.Setenv("STARTERCTL_CONFIG_DIR", "")

	if runtime.GOOS == "windows" {
		t.Setenv("APPDATA", `C:\Users\tester\AppData\Roaming`)
		require.Equal(t, filepath.Join(`C:\Users\tester\AppData\Roaming`, "starterctl"), config.ConfigDir())
		return
	}

	home := t.TempDir()
	t.Setenv("HOME", home)
	require.Equal(t, filepath.Join(home, ".config", "starterctl"), config.ConfigDir())
}

func TestSaveSetsRestrictedPermissions(t *testing.T) {
	tempDir := t.TempDir()
	t.Setenv("STARTERCTL_CONFIG_DIR", tempDir)

	require.NoError(t, config.Save(&config.Config{ServerURL: "http://localhost", Token: "secret"}))
	info, err := os.Stat(filepath.Join(tempDir, "config.json"))
	require.NoError(t, err)
	if runtime.GOOS == "windows" {
		require.NotZero(t, info.Mode().Perm())
		return
	}
	require.Equal(t, os.FileMode(0o600), info.Mode().Perm())
}
