package handler

import (
	"net/http"

	"github.com/gin-gonic/gin"
)

func (h *Handler) GetSports(c *gin.Context) {
	sports, err := h.handMatchService.GetSports(c)
	if err != nil {
		c.AbortWithStatus(http.StatusInternalServerError)
		return
	}
	if len(sports) == 0 {
		c.AbortWithStatus(http.StatusNotFound)
		return
	}

	c.JSON(http.StatusOK, map[string]interface{}{
		"data": sports,
	})
}

func (h *Handler) GetBookmakers(c *gin.Context) {
	bookmakers, err := h.handMatchService.GetBookmakers(c)
	if err != nil {
		c.AbortWithStatus(http.StatusInternalServerError)
		return
	}
	if len(bookmakers) == 0 {
		c.AbortWithStatus(http.StatusNotFound)
		return
	}

	c.JSON(http.StatusOK, map[string]interface{}{
		"data": bookmakers,
	})
}
