const Joi = require('joi');
const ApiError = require('../utils/ApiError');

const validate = (schema) => {
  return (req, res, next) => {
    const dataToValidate = { ...req.body, ...req.query, ...req.params };
    const { error, value } = schema.validate(dataToValidate, {
      abortEarly: false,
      stripUnknown: true
    });

    if (error) {
      const errors = error.details.map(detail => ({
        field: detail.path[0],
        message: detail.message
      }));
      throw new ApiError(422, 'Validation failed', errors);
    }

    req.body = { ...req.body, ...value };
    next();
  };
};

module.exports = validate;
