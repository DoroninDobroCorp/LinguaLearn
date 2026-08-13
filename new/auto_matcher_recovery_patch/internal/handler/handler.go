package handler

import (
	"livebets/auto_matcher/internal/service"
	"livebets/pkg/monitoring/metrics"

	"github.com/gin-gonic/gin"
	"github.com/prometheus/client_golang/prometheus/promhttp"
)

type Handler struct {
	handMatchService    *service.HandMatcherService
	onlineMatchService  *service.OnlineMatcherService
	llmMatcherService   *service.LLMMatcherService
	healthHandler       *HealthHandler
	metrics             *metrics.Metrics
}

func NewHandler(
	handMatchService *service.HandMatcherService,
	onlineMatchService *service.OnlineMatcherService,
	llmMatcherService *service.LLMMatcherService,
	healthHandler *HealthHandler,
	m *metrics.Metrics,
) *Handler {
	return &Handler{
		handMatchService:    handMatchService,
		onlineMatchService:  onlineMatchService,
		llmMatcherService:   llmMatcherService,
		healthHandler:       healthHandler,
		metrics:             m,
	}
}

func (h *Handler) InitRoutes() *gin.Engine {
	router := gin.New()
	router.Use(gin.Recovery())

	// Prometheus metrics middleware
	if h.metrics != nil {
		router.Use(h.metrics.HTTPMiddleware())
	}

	// CORS disabled - handled by nginx (double header causes browser error)
	// router.Use(cors.New(cors.Config{
	// 	AllowOrigins:     []string{"*"},
	// 	AllowMethods:     []string{"GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"},
	// 	AllowHeaders:     []string{"Origin", "X-Requested-With", "Content-Type", "Accept", "Authorization", "Cookie", "Content-Length", "X-CSRF-Token", "Accept-Encoding", "Cache-Control"},
	// 	ExposeHeaders:    []string{"*"},
	// 	AllowCredentials: true,
	// 	AllowOriginFunc: func(origin string) bool {
	// 		return origin == "*"
	// 	},
	// 	MaxAge: 4 * time.Hour,
	// }))

	// Health endpoints
	router.GET("/health", h.healthHandler.Health)
	router.GET("/health/liveness", h.healthHandler.Liveness)
	router.GET("/health/readiness", h.healthHandler.Readiness)

	// Metrics endpoint
	router.GET("/metrics", gin.WrapH(promhttp.Handler()))

	hand_merge := router.Group("/hand-merge")
	{
		hand_merge.GET("/bookmakers", h.GetBookmakers)
		hand_merge.GET("/sports", h.GetSports)

		leagues := hand_merge.Group("/leagues")
		{
			leagues.GET("/", h.GetAllLeaguesByBookmaker)
			leagues.GET("/get-unmatch", h.GetUnMatchedLeagues)
			leagues.GET("/get-match", h.GetMatchedLeagues)
			leagues.POST("/create-pair", h.CreateNewLeaguePair)
			// leagues.GET("/candidates", h.GetLeagueCandidates) // УДАЛЕНО - AutoMatcherService
			leagues.GET("/online-unmatch", h.GetOnlineUnmatchLeagues)
			leagues.GET("/online-unmatch-prematch", h.GetOnlineUnmatchLeaguesPrematch)
			// Управление парами лиг
			leagues.GET("/pairs", h.GetAllLeaguePairs)
			leagues.DELETE("/pairs/:id", h.DeleteLeaguePair)
			leagues.POST("/pairs/bulk-delete", h.BulkDeleteLeaguePairs)
		}

		teams := hand_merge.Group("/teams")
		{
			teams.GET("/get-unmatch", h.GetUnMatchedTeamsByLeagues)
			teams.GET("/get-match", h.GetMatchedTeamsByLeagues)
			teams.POST("/create-pair", h.CreateNewTeamPair)
			// teams.GET("/candidates", h.GetTeamCandidates) // УДАЛЕНО - AutoMatcherService
			teams.GET("/online-unmatch", h.GetOnlineUnmatchTeamsByLeagues)
			teams.GET("/online-unmatch-prematch", h.GetOnlineUnmatchTeamsByLeaguesPrematch)
			teams.GET("/online/decisions", h.GetMatchingDecisions) // New endpoint
		}

		// Pending pairs endpoints (human-in-the-loop)
		pending := hand_merge.Group("/pending")
		{
			pending.GET("/leagues", h.GetPendingLeaguePairs)
			pending.GET("/teams", h.GetPendingTeamPairs)
			pending.POST("/leagues/:id/approve", h.ApproveLeaguePair)
			pending.POST("/leagues/:id/reject", h.RejectLeaguePair)
			pending.POST("/teams/:id/approve", h.ApproveTeamPair)
			pending.POST("/teams/:id/reject", h.RejectTeamPair)
			pending.POST("/leagues/approve-all", h.ApproveAllLeaguePairs)
		}

		// Mapping status for Parser Inspector
		hand_merge.GET("/mapping-status", h.GetMappingStatus)
		hand_merge.POST("/mapping-status-batch", h.GetMappingStatusBatch)
	}

	return router
}
