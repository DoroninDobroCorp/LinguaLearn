package utils

import "time"

// Date represents a date (year, month, day).
type Date struct {
	Year  int        // Year (e.g., 2014).
	Month time.Month // Month of the year (January = 1, ...).
	Day   int        // Day of the month, starting at 1.
}

// ParseDate returns a date from the given string value
// that is formatted with the default YYYY-MM-DD format.
func ParseDate(value string) (Date, error) {
	t, err := time.Parse("2006-01-02", value)
	if err != nil {
		return Date{}, err
	}

	return DateOf(t), nil
}

// DateOf returns the Date in which a time occurs in that time's location.
func DateOf(t time.Time) Date {
	d := Date{}
	d.Year, d.Month, d.Day = t.Date()
	return d
}

