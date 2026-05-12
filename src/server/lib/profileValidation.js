const { z } = require('zod');

const supportedCountries = [
  'US', 'CA', 'GB', 'AU', 'DE', 'FR', 'ES', 'IT', 'NL', 'SE', 'JP', 'BR', 'IN', 'MX', 'NZ', 'IE', 'CH', 'BE', 'DK', 'NO',
];
const supportedLanguages = ['en', 'es', 'fr', 'de', 'pt', 'ja'];

const profileSchema = z.object({
  dateOfBirth: z
    .string()
    .optional()
    .refine((value) => {
      if (!value) return true;
      const date = new Date(value);
      return !Number.isNaN(date.getTime()) && date < new Date();
    }, 'Date of birth must be a valid past date'),
  alternativeEmail: z
    .string()
    .email('Alternative email must be valid')
    .optional()
    .or(z.literal('')),
  country: z
    .string()
    .optional()
    .refine((value) => !value || supportedCountries.includes(value.toUpperCase()), 'Country must be selected from supported values'),
  preferredLanguage: z
    .string()
    .optional()
    .refine((value) => !value || supportedLanguages.includes(value.toLowerCase()), 'Preferred language must be supported'),
  themePreference: z.enum(['light', 'dark']).optional(),
});

function validateProfilePayload(payload) {
  const parsed = profileSchema.parse(payload);
  return {
    ...parsed,
    country: parsed.country ? parsed.country.toUpperCase() : parsed.country,
    preferredLanguage: parsed.preferredLanguage ? parsed.preferredLanguage.toLowerCase() : parsed.preferredLanguage,
  };
}

module.exports = {
  profileSchema,
  supportedCountries,
  supportedLanguages,
  validateProfilePayload,
};
