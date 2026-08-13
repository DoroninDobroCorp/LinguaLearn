package handler

import (
	"net/http"

	"livebets/pkg/utils"

	"github.com/gin-gonic/gin"
)

func (h *Handler) GetOnlineUnmatchLeagues(c *gin.Context) {
	sportName := c.Query("sportName")
	if sportName == "" {
		c.AbortWithStatus(http.StatusBadRequest)
		return
	}
	firstBookmakerName := c.Query("firstBookmakerName")
	if firstBookmakerName == "" {
		c.AbortWithStatus(http.StatusBadRequest)
		return
	}
	secondBookmakerName := c.Query("secondBookmakerName")
	if secondBookmakerName == "" {
		c.AbortWithStatus(http.StatusBadRequest)
		return
	}
	if firstBookmakerName == secondBookmakerName {
		c.AbortWithStatus(http.StatusBadRequest)
		return
	}

	traceID := c.GetHeader("X-Trace-ID")
	if traceID == "" {
		traceID = utils.GenerateUUID()
	}

	// Check if withTeams param is set
	if c.Query("withTeams") == "true" {
		leagues, err := h.onlineMatchService.GetOnlineUnmatchLeaguesWithTeams(c, sportName, firstBookmakerName, secondBookmakerName, traceID)
		if err != nil {
			c.AbortWithStatus(http.StatusInternalServerError)
			return
		}
		c.JSON(http.StatusOK, map[string]interface{}{"data": leagues})
		return
	}

	leagues, err := h.onlineMatchService.GetOnlineUnmatchLeagues(c, sportName, firstBookmakerName, secondBookmakerName, traceID)
	if err != nil {
		c.AbortWithStatus(http.StatusInternalServerError)
		return
	}

	c.JSON(http.StatusOK, map[string]interface{}{
		"data": leagues,
	})
}

func (h *Handler) GetOnlineUnmatchTeamsByLeagues(c *gin.Context) {
	sportName := c.Query("sportName")
	if sportName == "" {
		c.AbortWithStatus(http.StatusBadRequest)
		return
	}
	firstBookmakerName := c.Query("firstBookmakerName")
	if firstBookmakerName == "" {
		c.AbortWithStatus(http.StatusBadRequest)
		return
	}
	secondBookmakerName := c.Query("secondBookmakerName")
	if secondBookmakerName == "" {
		c.AbortWithStatus(http.StatusBadRequest)
		return
	}
	if firstBookmakerName == secondBookmakerName {
		c.AbortWithStatus(http.StatusBadRequest)
		return
	}

	traceID := c.GetHeader("X-Trace-ID")
	if traceID == "" {
		traceID = utils.GenerateUUID()
	}

	teams, err := h.onlineMatchService.GetOnlineUnmatchTeams(c, sportName, firstBookmakerName, secondBookmakerName, traceID)
	if err != nil {
		c.AbortWithStatus(http.StatusInternalServerError)
		return
	}

	c.JSON(http.StatusOK, map[string]interface{}{
		"data": teams,
	})
}

func (h *Handler) GetOnlineUnmatchLeaguesPrematch(c *gin.Context) {
	sportName := c.Query("sportName")
	if sportName == "" {
		c.AbortWithStatus(http.StatusBadRequest)
		return
	}
	firstBookmakerName := c.Query("firstBookmakerName")
	if firstBookmakerName == "" {
		c.AbortWithStatus(http.StatusBadRequest)
		return
	}
	secondBookmakerName := c.Query("secondBookmakerName")
	if secondBookmakerName == "" {
		c.AbortWithStatus(http.StatusBadRequest)
		return
	}
	if firstBookmakerName == secondBookmakerName {
		c.AbortWithStatus(http.StatusBadRequest)
		return
	}

	traceID := c.GetHeader("X-Trace-ID")
	if traceID == "" {
		traceID = utils.GenerateUUID()
	}

	if c.Query("withTeams") == "true" {
		leagues, err := h.onlineMatchService.GetOnlineUnmatchLeaguesWithTeamsPrematch(c, sportName, firstBookmakerName, secondBookmakerName, traceID)
		if err != nil {
			c.AbortWithStatus(http.StatusInternalServerError)
			return
		}
		c.JSON(http.StatusOK, map[string]interface{}{"data": leagues})
		return
	}

	leagues, err := h.onlineMatchService.GetOnlineUnmatchLeaguesPrematch(c, sportName, firstBookmakerName, secondBookmakerName, traceID)
	if err != nil {
		c.AbortWithStatus(http.StatusInternalServerError)
		return
	}

	c.JSON(http.StatusOK, map[string]interface{}{
		"data": leagues,
	})
}

func (h *Handler) GetOnlineUnmatchTeamsByLeaguesPrematch(c *gin.Context) {
	sportName := c.Query("sportName")
	if sportName == "" {
		c.AbortWithStatus(http.StatusBadRequest)
		return
	}
	firstBookmakerName := c.Query("firstBookmakerName")
	if firstBookmakerName == "" {
		c.AbortWithStatus(http.StatusBadRequest)
		return
	}
	secondBookmakerName := c.Query("secondBookmakerName")
	if secondBookmakerName == "" {
		c.AbortWithStatus(http.StatusBadRequest)
		return
	}
	if firstBookmakerName == secondBookmakerName {
		c.AbortWithStatus(http.StatusBadRequest)
		return
	}

	traceID := c.GetHeader("X-Trace-ID")
	if traceID == "" {
		traceID = utils.GenerateUUID()
	}

	teams, err := h.onlineMatchService.GetOnlineUnmatchTeamsPrematch(c, sportName, firstBookmakerName, secondBookmakerName, traceID)
	if err != nil {
		c.AbortWithStatus(http.StatusInternalServerError)
		return
	}

	c.JSON(http.StatusOK, map[string]interface{}{
		"data": teams,
	})
}

// GetMatchingDecisions returns recent matching decisions
func (h *Handler) GetMatchingDecisions(c *gin.Context) {
	limit := 100 // Default limit

	decisions, err := h.llmMatcherService.GetRecentDecisions(limit)
	if err != nil {
		c.JSON(http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, decisions)
}
