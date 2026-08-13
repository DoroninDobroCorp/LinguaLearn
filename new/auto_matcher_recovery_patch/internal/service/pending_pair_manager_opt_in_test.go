package service

import (
	"os"
	"path/filepath"
	"testing"

	"livebets/auto_matcher/internal/entity"

	"github.com/stretchr/testify/require"
)

func TestPendingPairManagerIsDisabledByDefault(t *testing.T) {
	logsDir := filepath.Join(t.TempDir(), "logs")

	manager, err := newPendingPairManagerIfEnabled(false, logsDir)
	require.NoError(t, err)
	require.Nil(t, manager)
	_, statErr := os.Stat(logsDir)
	require.ErrorIs(t, statErr, os.ErrNotExist)
}

func TestPendingPairManagerRequiresExplicitOptIn(t *testing.T) {
	logsDir := filepath.Join(t.TempDir(), "logs")

	manager, err := newPendingPairManagerIfEnabled(true, logsDir)
	require.NoError(t, err)
	require.NotNil(t, manager)
	require.NoError(t, manager.SavePendingLeaguePair(entity.PendingLeaguePair{
		BK1LeagueID: 1,
		BK2LeagueID: 2,
	}))

	_, statErr := os.Stat(filepath.Join(logsDir, "pending_league_pairs.jsonl"))
	require.NoError(t, statErr)
}
