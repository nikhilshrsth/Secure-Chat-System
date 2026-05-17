const { OAuth2Client } = require('google-auth-library');

let googleClient = null;

function getGoogleClient() {
  if (googleClient) {
    return googleClient;
  }

  const clientId = process.env.GOOGLE_CLIENT_ID;

  if (!clientId) {
    const error = new Error('GOOGLE_CLIENT_ID is not configured');
    error.statusCode = 500;
    throw error;
  }

  googleClient = new OAuth2Client(clientId);
  return googleClient;
}

async function verifyGoogleIdToken(idToken) {
  if (!idToken) {
    const error = new Error('Google ID token is required');
    error.statusCode = 400;
    throw error;
  }

  const client = getGoogleClient();
  let ticket;

  try {
    ticket = await client.verifyIdToken({
      idToken,
      audience: process.env.GOOGLE_CLIENT_ID,
    });
  } catch (verifyError) {
    const error = new Error(
      'Invalid Google ID token. Ensure GOOGLE_CLIENT_ID matches the frontend client and your current origin is authorized in Google Cloud Console.',
    );
    error.statusCode = 401;
    error.cause = verifyError;
    throw error;
  }

  const payload = ticket.getPayload();

  if (!payload || !payload.sub || !payload.email) {
    const error = new Error('Invalid Google token payload');
    error.statusCode = 401;
    throw error;
  }

  return {
    googleId: payload.sub,
    email: payload.email,
    username: payload.name || payload.email.split('@')[0],
    emailVerified: Boolean(payload.email_verified),
  };
}

module.exports = {
  verifyGoogleIdToken,
};
