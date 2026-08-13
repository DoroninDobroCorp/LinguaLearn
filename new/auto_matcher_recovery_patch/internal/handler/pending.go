package handler

import (
	"net/http"

	"github.com/gin-gonic/gin"
)

// GetPendingLeaguePairs возвращает лиги в очереди на ручную проверку
func (h *Handler) GetPendingLeaguePairs(c *gin.Context) {
	status := c.DefaultQuery("status", "pending") // pending, approved, rejected, all

	if status == "all" {
		status = ""
	}

	pairs, err := h.llmMatcherService.GetPendingLeaguePairs(status)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, pairs)
}

// GetPendingTeamPairs возвращает команды в очереди на ручную проверку
func (h *Handler) GetPendingTeamPairs(c *gin.Context) {
	status := c.DefaultQuery("status", "pending")

	if status == "all" {
		status = ""
	}

	pairs, err := h.llmMatcherService.GetPendingTeamPairs(status)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, pairs)
}

// ApproveLeaguePair подтверждает и создает пару лиг
func (h *Handler) ApproveLeaguePair(c *gin.Context) {
	id := c.Param("id")
	
	type Request struct {
		ReviewedBy string `json:"reviewed_by"`
	}
	
	var req Request
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request"})
		return
	}

	err := h.llmMatcherService.ApproveLeaguePair(c.Request.Context(), id, req.ReviewedBy)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "League pair approved and created"})
}

// RejectLeaguePair отклоняет пару лиг
func (h *Handler) RejectLeaguePair(c *gin.Context) {
	id := c.Param("id")
	
	type Request struct {
		ReviewedBy   string `json:"reviewed_by"`
		RejectReason string `json:"reject_reason"`
	}
	
	var req Request
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request"})
		return
	}

	err := h.llmMatcherService.RejectLeaguePair(id, req.ReviewedBy, req.RejectReason)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "League pair rejected"})
}

// ApproveTeamPair подтверждает и создает пару команд
func (h *Handler) ApproveTeamPair(c *gin.Context) {
	id := c.Param("id")
	
	type Request struct {
		ReviewedBy string `json:"reviewed_by"`
	}
	
	var req Request
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request"})
		return
	}

	err := h.llmMatcherService.ApproveTeamPair(c.Request.Context(), id, req.ReviewedBy)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Team pair approved and created"})
}

// RejectTeamPair отклоняет пару команд
func (h *Handler) RejectTeamPair(c *gin.Context) {
	id := c.Param("id")
	
	type Request struct {
		ReviewedBy   string `json:"reviewed_by"`
		RejectReason string `json:"reject_reason"`
	}
	
	var req Request
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request"})
		return
	}

	err := h.llmMatcherService.RejectTeamPair(id, req.ReviewedBy, req.RejectReason)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Team pair rejected"})
}
