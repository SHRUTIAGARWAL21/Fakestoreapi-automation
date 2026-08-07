/** JSON Schema for the Product resource, contract version v1. */

export const productSchema = {
  $id: 'https://fakestoreapi.test/schemas/v1/product.json',
  $schema: 'http://json-schema.org/draft-07/schema#',
  title: 'Product',
  type: 'object',
  required: ['id', 'title', 'price', 'description', 'category', 'image'],
  additionalProperties: true,
  properties: {
    id: { type: 'integer', minimum: 1 },
    title: { type: 'string', minLength: 1 },
    price: { type: 'number', exclusiveMinimum: 0 },
    description: { type: 'string' },
    category: { type: 'string', minLength: 1 },
    image: { type: 'string', format: 'uri' },
    rating: {
      type: 'object',
      required: ['rate', 'count'],
      additionalProperties: false,
      properties: {
        rate: { type: 'number', minimum: 0, maximum: 5 },
        count: { type: 'integer', minimum: 0 },
      },
    },
  },
} as const;
