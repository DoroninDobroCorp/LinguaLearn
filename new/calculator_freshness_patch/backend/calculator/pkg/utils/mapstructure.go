package utils

import (
	"reflect"
	"time"

	"github.com/mitchellh/mapstructure"
)

// DefaultDecodeHooks are the default decoding hooks used to unmarshal into a struct.
// This includes hooks for parsing string to time.Duration, time.Time(RFC3339 format).
// You can use this function to grab the defaults plus add your
// own with the extras option.
func DefaultDecodeHooks(extras ...mapstructure.DecodeHookFunc) []mapstructure.DecodeHookFunc {
	return append([]mapstructure.DecodeHookFunc{
		mapstructure.RecursiveStructToMapHookFunc(),
		mapstructure.StringToTimeDurationHookFunc(),
		mapstructure.StringToTimeHookFunc(time.RFC3339),
		StringToDateHookFunc(),
	}, extras...)
}

// StringToDateHookFunc returns a DecodeHookFunc that converts
// strings to Date.
func StringToDateHookFunc() mapstructure.DecodeHookFunc {
	return func(f reflect.Type, t reflect.Type, data interface{}) (interface{}, error) {
		if f.Kind() != reflect.String {
			return data, nil
		}

		if t != reflect.TypeOf(Date{}) {
			return data, nil
		}

		return ParseDate(data.(string))
	}
}
