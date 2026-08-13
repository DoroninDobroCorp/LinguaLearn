package handler

import (
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
)

type BulkDeleteRequest struct {
	IDs []int64 `json:"ids"`
}

func (h *Handler) GetAllLeaguePairs(c *gin.Context) {
	// Пагинация
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "50"))

	if page < 1 {
		page = 1
	}
	if limit < 1 || limit > 200 {
		limit = 50
	}

	// Фильтры
	sportFilter := c.Query("sport")
	bookmakerFilter := c.Query("bookmaker")

	result, err := h.handMatchService.GetAllLeaguePairs(c, page, limit, sportFilter, bookmakerFilter)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, result)
}

func (h *Handler) DeleteLeaguePair(c *gin.Context) {
	idStr := c.Param("id")
	id, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid pair id"})
		return
	}

	err = h.handMatchService.DeleteLeaguePair(c, id)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"success": true, "deleted_id": id})
}

func (h *Handler) BulkDeleteLeaguePairs(c *gin.Context) {
	var req BulkDeleteRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request body"})
		return
	}

	if len(req.IDs) == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "no ids provided"})
		return
	}

	if len(req.IDs) > 100 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "too many ids, max 100"})
		return
	}

	err := h.handMatchService.BulkDeleteLeaguePairs(c, req.IDs)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"success": true, "deleted_count": len(req.IDs)})
}
