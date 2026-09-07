// YooKassa webhook verification utilities
import crypto from "crypto";

/**
 * YooKassa notification IP addresses (as of 2024)
 * Source: https://yookassa.ru/developers/using-api/webhooks
 */
const YOOKASSA_IPS = [
  "185.71.76.0/27",
  "185.71.77.0/27",
  "77.75.153.0/25",
  "77.75.156.11",
  "77.75.156.35",
  "77.75.154.128/25",
  "2a02:5180::/32",
];

/**
 * Parse CIDR notation to check if IP is in range
 */
function ipInCIDR(ip: string, cidr: string): boolean {
  if (!cidr.includes('/')) {
    // Single IP
    return ip === cidr;
  }

  const [range, bits] = cidr.split('/');
  const mask = ~(2 ** (32 - parseInt(bits, 10)) - 1);

  const ipNum = ip.split('.').reduce((acc, octet) => (acc << 8) + parseInt(octet, 10), 0);
  const rangeNum = range.split('.').reduce((acc, octet) => (acc << 8) + parseInt(octet, 10), 0);

  return (ipNum & mask) === (rangeNum & mask);
}

/**
 * Check if IP address is from YooKassa
 */
export function isYooKassaIP(ip: string): boolean {
  // Skip IPv6 for now (just allow if it matches the prefix)
  if (ip.includes(':')) {
    return YOOKASSA_IPS.some(range => range.includes(':') && ip.startsWith(range.split('/')[0].slice(0, 10)));
  }

  return YOOKASSA_IPS.some(range => ipInCIDR(ip, range));
}

/**
 * Verify Basic Auth credentials for YooKassa webhook
 * YooKassa sends: Authorization: Basic base64(shopId:notificationPassword)
 */
export function verifyYooKassaAuth(authHeader: string | undefined, expectedShopId: string, expectedPassword: string): boolean {
  if (!authHeader || !authHeader.startsWith('Basic ')) {
    return false;
  }

  const base64Credentials = authHeader.substring(6);
  const credentials = Buffer.from(base64Credentials, 'base64').toString('utf-8');
  const [shopId, password] = credentials.split(':');

  return shopId === expectedShopId && password === expectedPassword;
}

/**
 * Get client IP from request, handling proxies
 */
export function getClientIP(req: any): string {
  // Check X-Forwarded-For (if behind proxy)
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    const ips = forwarded.split(',');
    return ips[0].trim();
  }

  // Check X-Real-IP
  const realIP = req.headers['x-real-ip'];
  if (realIP) {
    return realIP;
  }

  // Fallback to socket
  return req.socket.remoteAddress || req.connection.remoteAddress || 'unknown';
}
