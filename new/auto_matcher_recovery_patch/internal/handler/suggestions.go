package handler

import (
	"net/http"

	"github.com/gin-gonic/gin"
)

// ApproveAllLeaguePairs approves all pending league pairs at once
func (h *Handler) ApproveAllLeaguePairs(c *gin.Context) {
	type Request struct {
		ReviewedBy string `json:"reviewed_by"`
	}

	var req Request
	if err := c.ShouldBindJSON(&req); err != nil {
		req.ReviewedBy = "admin"
	}
	if req.ReviewedBy == "" {
		req.ReviewedBy = "admin"
	}

	// Get all pending pairs
	pairs, err := h.llmMatcherService.GetPendingLeaguePairs("pending")
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	if len(pairs) == 0 {
		c.JSON(http.StatusOK, gin.H{
			"message":  "No pending pairs to approve",
			"approved": 0,
			"failed":   0,
		})
		return
	}

	approved := 0
	failed := 0

	for _, pair := range pairs {
		err := h.llmMatcherService.ApproveLeaguePair(c.Request.Context(), pair.ID, req.ReviewedBy)
		if err != nil {
			failed++
		} else {
			approved++
		}
	}

	c.JSON(http.StatusOK, gin.H{
		"message":  "Bulk approve completed",
		"approved": approved,
		"failed":   failed,
	})
}
