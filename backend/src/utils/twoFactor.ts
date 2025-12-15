import speakeasy from 'speakeasy';
import QRCode from 'qrcode';

const ISSUER = process.env.TWO_FACTOR_ISSUER || 'Resto Management';

export interface TwoFactorSecret {
  secret: string;
  qrCodeUrl: string;
}

export const generateTwoFactorSecret = async (email: string): Promise<TwoFactorSecret> => {
  const secret = speakeasy.generateSecret({
    name: `${ISSUER} (${email})`,
    issuer: ISSUER,
  });

  const qrCodeUrl = await QRCode.toDataURL(secret.otpauth_url!);

  return {
    secret: secret.base32!,
    qrCodeUrl,
  };
};

export const verifyTwoFactorToken = (token: string, secret: string): boolean => {
  return speakeasy.totp.verify({
    secret,
    encoding: 'base32',
    token,
    window: 2, // Разрешаем отклонение в ±2 периода (60 секунд)
  });
};

