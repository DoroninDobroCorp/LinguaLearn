package validation

import (
	"fmt"
	"strings"

	"github.com/go-playground/validator/v10"
)

var validate *validator.Validate

func init() {
	validate = validator.New()
	
	// Register custom validators
	validate.RegisterValidation("positive", validatePositive)
	validate.RegisterValidation("coef_min", validateCoefMin)
}

// Validator wraps go-playground validator
type Validator struct {
	validate *validator.Validate
}

// New creates a new validator instance
func New() *Validator {
	return &Validator{
		validate: validate,
	}
}

// Validate validates a struct
func (v *Validator) Validate(data interface{}) error {
	if err := v.validate.Struct(data); err != nil {
		return FormatValidationError(err)
	}
	return nil
}

// ValidateField validates a single field
func (v *Validator) ValidateField(field interface{}, tag string) error {
	if err := v.validate.Var(field, tag); err != nil {
		return FormatValidationError(err)
	}
	return nil
}

// FormatValidationError formats validation errors into human-readable format
func FormatValidationError(err error) error {
	if err == nil {
		return nil
	}

	validationErrs, ok := err.(validator.ValidationErrors)
	if !ok {
		return err
	}

	var errMsgs []string
	for _, e := range validationErrs {
		errMsgs = append(errMsgs, formatFieldError(e))
	}

	return fmt.Errorf("validation failed: %s", strings.Join(errMsgs, "; "))
}

func formatFieldError(e validator.FieldError) string {
	field := e.Field()
	tag := e.Tag()

	switch tag {
	case "required":
		return fmt.Sprintf("field '%s' is required", field)
	case "min":
		return fmt.Sprintf("field '%s' must be at least %s", field, e.Param())
	case "max":
		return fmt.Sprintf("field '%s' must be at most %s", field, e.Param())
	case "gt":
		return fmt.Sprintf("field '%s' must be greater than %s", field, e.Param())
	case "gte":
		return fmt.Sprintf("field '%s' must be greater than or equal to %s", field, e.Param())
	case "positive":
		return fmt.Sprintf("field '%s' must be positive", field)
	case "coef_min":
		return fmt.Sprintf("field '%s' must be at least 1.0 (coefficient)", field)
	default:
		return fmt.Sprintf("field '%s' failed validation '%s'", field, tag)
	}
}

// Custom validators

// validatePositive checks if value is positive
func validatePositive(fl validator.FieldLevel) bool {
	switch v := fl.Field().Interface().(type) {
	case float64:
		return v > 0
	case float32:
		return v > 0
	case int:
		return v > 0
	case int64:
		return v > 0
	default:
		return false
	}
}

// validateCoefMin checks if coefficient is >= 1.0
func validateCoefMin(fl validator.FieldLevel) bool {
	switch v := fl.Field().Interface().(type) {
	case float64:
		return v >= 1.0
	case float32:
		return v >= 1.0
	default:
		return false
	}
}
