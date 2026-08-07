/** JSON Schema for the API's error envelope, contract version v1. */

export const apiErrorSchema = {
  $id: 'https://fakestoreapi.test/schemas/v1/api-error.json',
  $schema: 'http://json-schema.org/draft-07/schema#',
  title: 'ApiErrorEnvelope',
  type: 'object',
  required: ['status', 'message'],
  additionalProperties: false,
  properties: {
    status: { type: 'string', enum: ['error'] },
    message: { type: 'string', minLength: 1 },
  },
} as const;
