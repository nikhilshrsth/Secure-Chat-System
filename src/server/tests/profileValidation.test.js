const mongoose = require('mongoose');
const { profileSchema, supportedCountries, supportedLanguages, validateProfilePayload } = require('../lib/profileValidation');
const UserProfile = require('../models/UserProfile');

describe('Profile validation', () => {
  it('accepts a valid payload with a past date', () => {
    const payload = {
      dateOfBirth: '1990-05-30',
      alternativeEmail: 'alt@example.com',
      country: 'US',
      preferredLanguage: 'en',
      themePreference: 'dark',
    };

    const result = profileSchema.parse(payload);

    expect(result).toEqual(payload);
  });

  it('rejects future dates for dateOfBirth', () => {
    expect(() => profileSchema.parse({ dateOfBirth: '2999-01-01' })).toThrow(/past date/);
  });

  it('rejects unsupported country values', () => {
    expect(() => profileSchema.parse({ country: 'XX' })).toThrow(/Country must be selected from supported values/);
  });

  it('rejects unsupported preferred language values', () => {
    expect(() => profileSchema.parse({ preferredLanguage: 'xx' })).toThrow(/Preferred language must be supported/);
  });

  it('exports supported country and language lists', () => {
    expect(supportedCountries).toContain('US');
    expect(supportedLanguages).toContain('en');
  });

  it('normalizes country and language when validating payloads', () => {
    const normalized = validateProfilePayload({ country: 'us', preferredLanguage: 'EN' });
    expect(normalized.country).toBe('US');
    expect(normalized.preferredLanguage).toBe('en');
  });
});

describe('UserProfile model', () => {
  it('defaults themePreference to light', () => {
    const profile = new UserProfile({ userId: new mongoose.Types.ObjectId() });
    expect(profile.themePreference).toBe('light');
  });

  it('rejects invalid themePreference values', () => {
    const profile = new UserProfile({ userId: new mongoose.Types.ObjectId(), themePreference: 'blue' });
    const error = profile.validateSync();
    expect(error.errors.themePreference).toBeDefined();
  });
});
