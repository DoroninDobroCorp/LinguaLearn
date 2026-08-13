package validation

import (
	"fmt"
	"github.com/go-playground/validator/v10"
)

var validate *validator.Validate

func init() {
	validate = validator.New()
}

// ValidateStruct validates a struct using go-playground/validator
//
// This is the BASE validation package without custom validators.
// For domain-specific validation (odds, stakes, etc.), use service-specific
// validation packages in analyzer/pkg/validation or calculator/pkg/validation.
//
// See pkg/validation/README.md for architecture explanation.
func ValidateStruct(s interface{}) error {
	if err := validate.Struct(s); err != nil {
		if validationErrors, ok := err.(validator.ValidationErrors); ok {
			return fmt.Errorf("validation failed: %s", formatValidationErrors(validationErrors))
		}
		return err
	}
	return nil
}

func formatValidationErrors(errs validator.ValidationErrors) string {
	var errMsg string
	for i, err := range errs {
		if i > 0 {
			errMsg += ", "
		}
		errMsg += fmt.Sprintf("%s: %s", err.Field(), err.Tag())
	}
	return errMsg
}
