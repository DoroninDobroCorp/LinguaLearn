import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function findOpenApiSpecPath() {
  if (process.env.OPENAPI_SPEC_PATH && fs.existsSync(process.env.OPENAPI_SPEC_PATH)) {
    return process.env.OPENAPI_SPEC_PATH;
  }

  const candidatePaths = [
    path.resolve(__dirname, '../../docs/openapi-writing-analysis-v1.json'),
    path.resolve(__dirname, '../docs/openapi-writing-analysis-v1.json'),
    path.resolve(__dirname, 'docs/openapi-writing-analysis-v1.json'),
  ];

  for (const candidate of candidatePaths) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  throw new Error('OpenAPI specification file not found in candidates: ' + candidatePaths.join(', '));
}

const specPath = findOpenApiSpecPath();
const specRaw = fs.readFileSync(specPath, 'utf8');
export const openApiSpec = JSON.parse(specRaw);

export const ajv = new Ajv({
  allErrors: true,
  strict: false,
});
addFormats(ajv);

// Add the canonical OpenAPI schema with URI identifier
ajv.addSchema(openApiSpec, 'openapi.json');

// Compile validators for primary contract components
export const validateAnalyzeRequest = ajv.compile({
  $ref: 'openapi.json#/components/schemas/AnalyzeRequest',
});

export const validateAnalyzeResponse = ajv.compile({
  $ref: 'openapi.json#/components/schemas/AnalyzeResponse',
});

export const validateErrorDetail = ajv.compile({
  $ref: 'openapi.json#/components/schemas/ErrorDetail',
});

export const validateMechanicalCorrection = ajv.compile({
  $ref: 'openapi.json#/components/schemas/MechanicalCorrection',
});

export const validateOptionalSuggestion = ajv.compile({
  $ref: 'openapi.json#/components/schemas/OptionalSuggestion',
});

export const validateTopicEvidence = ajv.compile({
  $ref: 'openapi.json#/components/schemas/TopicEvidence',
});

export const validateFeedbackRequest = ajv.compile({
  $ref: 'openapi.json#/components/schemas/FeedbackRequest',
});

export const validateDeviceTokenRequest = ajv.compile({
  $ref: 'openapi.json#/components/schemas/DeviceTokenRequest',
});

export const validateDeviceTokenResponse = ajv.compile({
  $ref: 'openapi.json#/components/schemas/DeviceTokenResponse',
});

export const validateErrorResponse = ajv.compile({
  $ref: 'openapi.json#/components/schemas/ErrorResponse',
});

/**
 * Validates AnalyzeResponse payload and returns formatted errors if invalid
 * @param {object} payload
 * @returns {{ valid: boolean, errors: Array|null, errorMessage: string|null }}
 */
export function checkAnalyzeResponse(payload) {
  const valid = Boolean(validateAnalyzeResponse(payload));
  if (valid) {
    return { valid: true, errors: null, errorMessage: null };
  }
  const formattedErrors = (validateAnalyzeResponse.errors || []).map((err) => ({
    path: err.instancePath || '/',
    keyword: err.keyword,
    message: err.message,
    params: err.params,
  }));
  const errorMessage = formattedErrors
    .map((e) => `[${e.path}] ${e.message}`)
    .join('; ');
  return {
    valid: false,
    errors: formattedErrors,
    errorMessage,
  };
}

/**
 * Asserts AnalyzeResponse payload matches OpenAPI contract schema, throwing detailed error on failure
 * @param {object} payload
 */
export function assertValidAnalyzeResponse(payload) {
  const check = checkAnalyzeResponse(payload);
  if (!check.valid) {
    throw new Error(`OpenAPI AnalyzeResponse validation failed: ${check.errorMessage}`);
  }
}
