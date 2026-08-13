package service

import (
	"context"
	"fmt"
	"livebets/calculator/internal/entity"
	"livebets/calculator/pkg/utils"
	"livebets/pkg/calculation/roi"
	"livebets/pkg/domain"
	"log"
	"strconv"
	"strings"
	"time"
)

func (l *LogsService) LogTestBetAccept(ctx context.Context, pairAccept entity.AcceptBet) error {
	// FIX 1.3: Use "Pinnacle" as first bookmaker for consistent keyMatch
	keyMatch := utils.GenerateFullMatchKey("Pinnacle", pairAccept.Pair.First.LeagueName, pairAccept.Pair.First.HomeName, pairAccept.Pair.First.AwayName, pairAccept.Pair.SportName, "")
	keyOutcome := utils.GenerateFullMatchKey(pairAccept.Pair.First.Bookmaker, pairAccept.Pair.Second.Bookmaker, pairAccept.Pair.First.MatchID, pairAccept.Pair.Second.MatchID, pairAccept.Pair.SportName, pairAccept.Pair.Outcome.Outcome)

	// Set percent
	percent := pairAccept.Sum / pairAccept.Bet.CalcBet.OriginalAmount * 100
	// per, ok := l.percentCache.Read(keyMatch)
	// if !ok {
	// 	l.percentCache.Write(keyMatch, entity.TotalPercent{TotalPercent: percent, CreatedAt: time.Now()})
	// } else {
	// 	per.TotalPercent += percent
	// 	per.CreatedAt = time.Now()
	// 	l.percentCache.Write(keyMatch, per)
	// }

	// Parse time
	strs := strings.Split(pairAccept.Time, ":")
	if len(strs) != 2 {
		err := fmt.Errorf("split time correct error")
		l.logger.Error().Err(err).Msgf("[LogsService.LogBetAccept] split time correct error")
		return err
	}

	minutes, err := strconv.Atoi(strs[0])
	if err != nil {
		l.logger.Error().Err(err).Msgf("[LogsService.LogBetAccept] parse string to int error")
		return err
	}

	seconds, err := strconv.Atoi(strs[1])
	if err != nil {
		l.logger.Error().Err(err).Msgf("[LogsService.LogBetAccept] parse string to int error")
		return err
	}

	bookmakerForPrices := pairAccept.Pair.Second.Bookmaker
	if bookmakerForPrices == "Ladbrokes2" {
		bookmakerForPrices = "Ladbrokes"
	}

	var priceRecods *entity.ResponsePriceRecords
	// Go to analyzer correct
	if pairAccept.Pair.IsLive {
		priceRecods, err = l.analyzerAPI.GeTPricesByTimeout(entity.RequestPriceRecordsByTime{
			Bookmaker1: pairAccept.Pair.First.Bookmaker,
			Bookmaker2: bookmakerForPrices,
			MatchID1:   pairAccept.Pair.First.MatchID,
			MatchID2:   pairAccept.Pair.Second.MatchID,
			SportName:  pairAccept.Pair.SportName,
			Outcome:    pairAccept.Pair.Outcome.Outcome,

			Minutes:  minutes,
			Seconds:  seconds,
			LongTime: 120,
		})
		if err != nil {
			l.logger.Error().Err(err).Msgf("[LogsService.LogBetAccept] get prices live error")
		}
	} else {
		priceRecods, err = l.analyzerPrematchAPI.GeTPricesByTimeout(entity.RequestPriceRecordsByTime{
			Bookmaker1: pairAccept.Pair.First.Bookmaker,
			Bookmaker2: bookmakerForPrices,
			MatchID1:   pairAccept.Pair.First.MatchID,
			MatchID2:   pairAccept.Pair.Second.MatchID,
			SportName:  pairAccept.Pair.SportName,
			Outcome:    pairAccept.Pair.Outcome.Outcome,

			Minutes:  minutes,
			Seconds:  seconds,
			LongTime: 1200,
		})
		if err != nil {
			l.logger.Error().Err(err).Msgf("[LogsService.LogBetAccept] get prices prematch error")
		}
	}

	// Get strategy (default to 'test' for test bets)
	strategy := pairAccept.Strategy
	if strategy == "" {
		strategy = "test"
	}

	if priceRecods == nil {
		l.logger.Error().Err(err).Msgf("[LogsService.LogBetAccept] get prices nil error")
		if err = l.txStorage.Storage().InsertLogTestBetAccept(ctx, keyMatch, keyOutcome, pairAccept, nil, percent, strategy); err != nil {
			l.logger.Error().Err(err).Msgf("[LogsService.LogBetAccept] insert log bet accept error")
			return err
		}
		return nil
	}
	if len(priceRecods.Records) <= priceRecods.ISave {
		l.logger.Error().Err(err).Msgf("[LogsService.LogBetAccept] get prices length records error")
		if err = l.txStorage.Storage().InsertLogTestBetAccept(ctx, keyMatch, keyOutcome, pairAccept, nil, percent, strategy); err != nil {
			l.logger.Error().Err(err).Msgf("[LogsService.LogBetAccept] insert log bet accept error")
			return err
		}
		return nil
	}

	// FIX: correct_data должен содержать РЕАЛЬНУЮ цену покупки и правильный ROI
	// (тот же fix что и в logs.go для реальных ставок)
	correctPriceRecord := priceRecods.Records[priceRecods.ISave]
	correctPriceRecord.Second.Score = pairAccept.Coef  // Заменяем на РЕАЛЬНУЮ цену покупки
	
	// Пересчитываем ROI с ПРАВИЛЬНОЙ формулой (той же что используется для roi_1min)
	roiCalc := roi.NewCalculator()
	calculatedROI := roiCalc.Calculate(
		pairAccept.Coef,                           // Коэфф донора (РЕАЛЬНАЯ цена покупки)
		correctPriceRecord.First.Score,           // Коэфф Pinnacle в момент ставки
		correctPriceRecord.Margin,                // Margin
		roi.MarketType(pairAccept.Pair.Outcome.MarketType),
		domain.Parser(pairAccept.Pair.Second.Bookmaker),
		domain.SportName(pairAccept.Pair.SportName),
		pairAccept.Pair.IsLive,                   // Live/Prematch mode
	)
	correctPriceRecord.ROI = calculatedROI
	
	log.Printf("[LogTestBetAccept] ROI calculation: donor=%.2f pinnacle=%.2f margin=%.4f oldROI=%.2f newROI=%.2f", 
		pairAccept.Coef, correctPriceRecord.First.Score, correctPriceRecord.Margin,
		priceRecods.Records[priceRecods.ISave].ROI, calculatedROI)
	
	if err = l.txStorage.Storage().InsertLogTestBetAccept(ctx, keyMatch, keyOutcome, pairAccept, &correctPriceRecord, percent, strategy); err != nil {
		l.logger.Error().Err(err).Msgf("[LogsService.LogBetAccept] insert log bet accept error")
		return err
	}

	if pairAccept.Pair.Outcome.ROI > 3 && pairAccept.Pair.Outcome.ROI < 15 {
		if err = sendMissedBet(pairAccept.Pair, keyMatch); err != nil {
			l.logger.Error().Err(err).Msgf("[LogsService.LogBetAccept] send missed bet error")
		}
	}

	correctROI := correctPriceRecord.ROI
	betCreatedAt := time.Now().UTC()  // Запоминаем время создания тестовой ставки
	// FIX 1.5: Use background context for async goroutine — request ctx is cancelled after HTTP response
	go l.GetPricesForFlie(context.Background(), pairAccept, minutes, seconds, correctROI, betCreatedAt, true)

	// CLV: Capture Pinnacle closing line for test bets too
	if !pairAccept.Pair.IsLive && !pairAccept.Pair.First.MatchDate.IsZero() {
		go l.CaptureClosingLine(context.Background(), pairAccept, pairAccept.Pair.First.MatchDate, keyOutcome, betCreatedAt)
	}

	return nil
}
