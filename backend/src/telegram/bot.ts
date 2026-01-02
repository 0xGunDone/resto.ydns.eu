import { Telegraf, Context } from 'telegraf';
import dbClient from '../utils/db';
import axios from 'axios';
import { 
  getTelegramSessionService, 
  ParsedTelegramSession,
  RegistrationData,
  TelegramStep 
} from '../services/telegramSessionService';
import { logger } from '../services/loggerService';

/**
 * Extended context with session data loaded from database
 */
interface SessionData {
  step: TelegramStep;
  inviteToken: string | null;
  registrationData: RegistrationData | null;
}

type MyContext = Context & { 
  session: SessionData;
  telegramUserId: string;
};

// Bot instance (initialized in startBot())
let bot: Telegraf<MyContext> | null = null;
const BOT_USERNAME = process.env.TELEGRAM_BOT_USERNAME || 'myResto_robot';
const API_BASE = process.env.API_BASE_URL || 'http://localhost:3001/api';

// ============================================
// Rate Limiting (Requirements: 3.5)
// ============================================

/**
 * Rate limit configuration
 */
export interface RateLimitConfig {
  maxCommands: number;  // Maximum commands allowed
  windowMs: number;     // Time window in milliseconds
}

/**
 * Default rate limit: 10 commands per 60 seconds
 */
const DEFAULT_RATE_LIMIT: RateLimitConfig = {
  maxCommands: 10,
  windowMs: 60 * 1000, // 60 seconds
};

/**
 * Rate limit entry for a user
 */
interface RateLimitEntry {
  count: number;
  windowStart: number;
}

/**
 * In-memory rate limit store
 */
const rateLimitStore = new Map<string, RateLimitEntry>();

/**
 * Clean up old rate limit entries periodically
 */
let rateLimitCleanupInterval: NodeJS.Timeout | null = null;

/**
 * Start rate limit cleanup scheduler
 */
function startRateLimitCleanup(windowMs: number): void {
  if (rateLimitCleanupInterval) return;
  
  // Clean up every 5 minutes
  rateLimitCleanupInterval = setInterval(() => {
    const now = Date.now();
    for (const [userId, entry] of rateLimitStore.entries()) {
      if (now - entry.windowStart > windowMs * 2) {
        rateLimitStore.delete(userId);
      }
    }
  }, 5 * 60 * 1000);
}

/**
 * Stop rate limit cleanup scheduler
 */
function stopRateLimitCleanup(): void {
  if (rateLimitCleanupInterval) {
    clearInterval(rateLimitCleanupInterval);
    rateLimitCleanupInterval = null;
  }
}

/**
 * Check if a user is rate limited
 * Returns true if the user should be blocked, false if allowed
 */
export function isRateLimited(
  userId: string, 
  config: RateLimitConfig = DEFAULT_RATE_LIMIT
): boolean {
  const now = Date.now();
  const entry = rateLimitStore.get(userId);
  
  if (!entry) {
    // First command from this user
    rateLimitStore.set(userId, { count: 1, windowStart: now });
    return false;
  }
  
  // Check if window has expired
  if (now - entry.windowStart > config.windowMs) {
    // Reset window
    rateLimitStore.set(userId, { count: 1, windowStart: now });
    return false;
  }
  
  // Window is still active
  if (entry.count >= config.maxCommands) {
    // Rate limited
    return true;
  }
  
  // Increment count
  entry.count++;
  return false;
}

/**
 * Get remaining commands for a user
 */
export function getRemainingCommands(
  userId: string,
  config: RateLimitConfig = DEFAULT_RATE_LIMIT
): number {
  const now = Date.now();
  const entry = rateLimitStore.get(userId);
  
  if (!entry || now - entry.windowStart > config.windowMs) {
    return config.maxCommands;
  }
  
  return Math.max(0, config.maxCommands - entry.count);
}

/**
 * Get time until rate limit resets (in seconds)
 */
export function getTimeUntilReset(
  userId: string,
  config: RateLimitConfig = DEFAULT_RATE_LIMIT
): number {
  const now = Date.now();
  const entry = rateLimitStore.get(userId);
  
  if (!entry) {
    return 0;
  }
  
  const timeRemaining = config.windowMs - (now - entry.windowStart);
  return Math.max(0, Math.ceil(timeRemaining / 1000));
}

/**
 * Reset rate limit for a user (for testing)
 */
export function resetRateLimit(userId: string): void {
  rateLimitStore.delete(userId);
}

/**
 * Clear all rate limits (for testing)
 */
export function clearAllRateLimits(): void {
  rateLimitStore.clear();
}

/**
 * Rate limiting middleware
 */
const rateLimitMiddleware = async (ctx: MyContext, next: () => Promise<void>) => {
  if (!ctx.from) {
    return next();
  }

  const userId = String(ctx.from.id);
  
  if (isRateLimited(userId)) {
    const timeRemaining = getTimeUntilReset(userId);
    logger.warn('Rate limit exceeded', { 
      telegramUserId: userId,
      timeRemaining,
    });
    
    await ctx.reply(
      `⚠️ Слишком много запросов. Пожалуйста, подождите ${timeRemaining} секунд.`
    );
    return;
  }

  return next();
};

// ============================================
// Session Management
// ============================================

/**
 * Session middleware - loads session from database
 */
const sessionMiddleware = async (ctx: MyContext, next: () => Promise<void>) => {
  if (!ctx.from) {
    return next();
  }

  const telegramUserId = String(ctx.from.id);
  ctx.telegramUserId = telegramUserId;

  try {
    const sessionService = getTelegramSessionService();
    const session = await sessionService.getOrCreateSession(telegramUserId);
    
    ctx.session = {
      step: session.step,
      inviteToken: session.inviteToken,
      registrationData: session.registrationData,
    };
  } catch (error) {
    logger.error('Failed to load session', { 
      telegramUserId, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    });
    // Initialize empty session on error
    ctx.session = {
      step: 'idle',
      inviteToken: null,
      registrationData: null,
    };
  }

  return next();
};

/**
 * Save session to database
 */
async function saveSession(ctx: MyContext): Promise<void> {
  if (!ctx.telegramUserId) return;

  try {
    const sessionService = getTelegramSessionService();
    await sessionService.updateSession(ctx.telegramUserId, {
      step: ctx.session.step,
      inviteToken: ctx.session.inviteToken,
      registrationData: ctx.session.registrationData,
    });
  } catch (error) {
    logger.error('Failed to save session', { 
      telegramUserId: ctx.telegramUserId,
      error: error instanceof Error ? error.message : 'Unknown error' 
    });
  }
}

/**
 * Clear session (delete from database)
 */
async function clearSession(ctx: MyContext): Promise<void> {
  if (!ctx.telegramUserId) return;

  try {
    const sessionService = getTelegramSessionService();
    await sessionService.deleteSession(ctx.telegramUserId);
    
    // Reset local session
    ctx.session = {
      step: 'idle',
      inviteToken: null,
      registrationData: null,
    };
  } catch (error) {
    logger.error('Failed to clear session', { 
      telegramUserId: ctx.telegramUserId,
      error: error instanceof Error ? error.message : 'Unknown error' 
    });
  }
}

/**
 * Invite token validation result
 */
interface TokenValidationResult {
  valid: boolean;
  inviteLink?: InviteLink;
  error?: string;
  errorCode?: 'NOT_FOUND' | 'EXPIRED' | 'USED' | 'INVALID' | 'NETWORK_ERROR';
}

/**
 * Validate invite token before collecting user data
 * Requirements: 3.2, 3.3
 */
export async function validateInviteToken(token: string): Promise<TokenValidationResult> {
  // Check for empty or whitespace-only tokens
  if (!token || typeof token !== 'string' || token.trim() === '') {
    return {
      valid: false,
      error: 'Токен приглашения не указан',
      errorCode: 'INVALID',
    };
  }

  try {
    const response = await axios.get(`${API_BASE}/invite-links/token/${token}`);
    const inviteLink = response.data.inviteLink as InviteLink;

    // Check if link is active
    if (!inviteLink) {
      return {
        valid: false,
        error: 'Пригласительная ссылка не найдена',
        errorCode: 'NOT_FOUND',
      };
    }

    return {
      valid: true,
      inviteLink,
    };
  } catch (error: unknown) {
    const axiosError = error as { 
      response?: { 
        status?: number; 
        data?: { error?: string; message?: string } 
      }; 
      message?: string 
    };

    logger.debug('Token validation failed', {
      token,
      status: axiosError.response?.status,
      error: axiosError.message,
    });

    if (axiosError.response?.status === 404) {
      return {
        valid: false,
        error: 'Пригласительная ссылка недействительна или истекла',
        errorCode: 'NOT_FOUND',
      };
    }

    if (axiosError.response?.status === 400) {
      const errorMessage = axiosError.response?.data?.error || 
                          axiosError.response?.data?.message || 
                          'Ссылка недействительна';
      
      // Determine specific error code
      let errorCode: TokenValidationResult['errorCode'] = 'INVALID';
      if (errorMessage.toLowerCase().includes('истек') || errorMessage.toLowerCase().includes('expired')) {
        errorCode = 'EXPIRED';
      } else if (errorMessage.toLowerCase().includes('использован') || errorMessage.toLowerCase().includes('used')) {
        errorCode = 'USED';
      }

      return {
        valid: false,
        error: errorMessage,
        errorCode,
      };
    }

    return {
      valid: false,
      error: 'Ошибка при проверке приглашения. Попробуйте позже.',
      errorCode: 'NETWORK_ERROR',
    };
  }
}

/**
 * Handle invite registration process
 */
async function handleInviteRegistration(ctx: MyContext): Promise<void> {
  const token = ctx.session.inviteToken;

  if (!token) {
    await ctx.reply('❌ Токен приглашения не найден');
    return;
  }

  // Validate token BEFORE collecting any user data (Requirements: 3.2, 3.3)
  const validation = await validateInviteToken(token);
  
  if (!validation.valid) {
    logger.warn('Invalid invite token rejected', {
      telegramUserId: ctx.telegramUserId,
      token,
      errorCode: validation.errorCode,
    });
    
    await ctx.reply(`❌ ${validation.error}\n\nПожалуйста, запросите новую ссылку у менеджера.`);
    ctx.session.inviteToken = null;
    await saveSession(ctx);
    return;
  }

  const inviteLink = validation.inviteLink!;

  try {
    if (!ctx.from) {
      await ctx.reply('❌ Ошибка: не удалось определить пользователя');
      return;
    }

    const telegramId = ctx.telegramUserId;

    // If link has no restaurant - this is Telegram binding
    if (!inviteLink.restaurantId) {
      await handleTelegramBinding(ctx, inviteLink, telegramId);
      return;
    }

    // Check if user is already registered
    const existingUser = await dbClient.user.findFirst({
      where: { telegramId: telegramId },
      include: {
        restaurants: {
          where: { 
            restaurantId: inviteLink.restaurantId,
            isActive: true,
          },
          include: {
            restaurant: true,
          },
        },
      },
    }) as UserWithRestaurants | null;

    // Check if already registered in this restaurant
    if (existingUser) {
      const alreadyInRestaurant = existingUser.restaurants.length > 0;

      if (alreadyInRestaurant) {
        await ctx.reply(
          `✅ Вы уже зарегистрированы в ресторане "${inviteLink.restaurant?.name}"`
        );
        ctx.session.inviteToken = null;
        await saveSession(ctx);
        return;
      }

      // User exists but not in this restaurant - start registration
      ctx.session.step = 'awaiting_first_name';
      await saveSession(ctx);
      await ctx.reply(
        `👋 Добро пожаловать!\n\n` +
        `Вы были приглашены в ресторан "${inviteLink.restaurant?.name}".\n\n` +
        `Для регистрации укажите ваше имя:`
      );
      return;
    }

    // New user - request registration data
    ctx.session.step = 'awaiting_first_name';
    await saveSession(ctx);
    await ctx.reply(
      `👋 Добро пожаловать!\n\n` +
      `Вы были приглашены в ресторан "${inviteLink.restaurant?.name}".\n\n` +
      `Для регистрации укажите ваше имя:`
    );
  } catch (error: unknown) {
    logger.error('Invite registration error', {
      telegramUserId: ctx.telegramUserId,
      token,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    
    await ctx.reply('❌ Ошибка при обработке приглашения. Попробуйте позже или создайте новую ссылку.');
    ctx.session.inviteToken = null;
    await saveSession(ctx);
  }
}

// Type for user with restaurants relation
interface UserWithRestaurants {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  telegramId: string | null;
  restaurants: Array<{
    restaurantId: string;
    isActive: boolean;
    restaurant?: { name: string };
  }>;
}

/**
 * Handle Telegram account binding
 */
async function handleTelegramBinding(
  ctx: MyContext, 
  inviteLink: InviteLink, 
  telegramId: string
): Promise<void> {
  try {
    // Find user by createdById from inviteLink
    const user = await dbClient.user.findUnique({
      where: { id: inviteLink.createdById },
      select: { id: true, firstName: true, lastName: true, telegramId: true },
    }) as { id: string; firstName: string; lastName: string; telegramId: string | null } | null;

    if (!user) {
      await ctx.reply('❌ Пользователь не найден');
      ctx.session.inviteToken = null;
      await saveSession(ctx);
      return;
    }

    // Check if Telegram is already bound to another account
    const existingUserWithTelegram = await dbClient.user.findFirst({
      where: { telegramId: telegramId },
      select: { id: true },
    }) as { id: string } | null;

    if (existingUserWithTelegram && existingUserWithTelegram.id !== user.id) {
      await ctx.reply('❌ Этот Telegram аккаунт уже привязан к другому пользователю');
      ctx.session.inviteToken = null;
      await saveSession(ctx);
      return;
    }

    // Bind Telegram to account
    await dbClient.user.update({
      where: { id: user.id },
      data: { telegramId: telegramId },
    });

    // Deactivate link
    await dbClient.inviteLink.update({
      where: { id: inviteLink.id },
      data: {
        usedCount: { increment: 1 },
        isActive: false,
      },
    });

    await ctx.reply(
      `✅ Telegram аккаунт успешно привязан!\n\n` +
      `Привет, ${user.firstName}! Теперь вы можете получать уведомления через Telegram.`
    );

    ctx.session.inviteToken = null;
    await saveSession(ctx);
  } catch (error: unknown) {
    logger.error('Telegram binding error', { 
      telegramUserId: ctx.telegramUserId,
      error: error instanceof Error ? error.message : 'Unknown error' 
    });
    await ctx.reply('❌ Ошибка при привязке Telegram. Попробуйте позже.');
    ctx.session.inviteToken = null;
    await saveSession(ctx);
  }
}

// Type for invite link
interface InviteLink {
  id: string;
  token: string;
  restaurantId: string | null;
  positionId: string | null;
  departmentId: string | null;
  createdById: string;
  restaurant?: { name: string };
}


/**
 * Add user to restaurant
 */
async function addUserToRestaurant(userId: string, inviteLink: InviteLink): Promise<void> {
  try {
    // Use API to mark link as used
    await axios.post(`${API_BASE}/invite-links/use`, {
      token: inviteLink.token,
    });

    // Check if already added to this restaurant (only active records)
    const existing = await dbClient.restaurantUser.findFirst({
      where: {
        restaurantId: inviteLink.restaurantId,
        userId: userId,
        isActive: true,
      },
    });

    if (existing) {
      return; // Already added
    }
    
    // If record exists but inactive - delete it to create new
    const inactiveRecord = await dbClient.restaurantUser.findUnique({
      where: {
        restaurantId_userId: {
          restaurantId: inviteLink.restaurantId!,
          userId: userId,
        },
      },
    });
    
    if (inactiveRecord && !inactiveRecord.isActive) {
      await dbClient.restaurantUser.delete({
        where: {
          restaurantId_userId: {
            restaurantId: inviteLink.restaurantId!,
            userId: userId,
          },
        },
      });
    }

    // Determine positionId - use from inviteLink or find first available position
    let positionId = inviteLink.positionId;
    if (!positionId) {
      const defaultPosition = await dbClient.position.findFirst({
        where: { 
          restaurantId: inviteLink.restaurantId,
          isActive: true,
        },
        select: { id: true },
      });
      if (!defaultPosition) {
        throw new Error('Не найдена должность для ресторана. Обратитесь к менеджеру.');
      }
      positionId = defaultPosition.id;
    }

    // Add user to restaurant
    await dbClient.restaurantUser.create({
      data: {
        restaurantId: inviteLink.restaurantId!,
        userId: userId,
        positionId: positionId,
        departmentId: inviteLink.departmentId || null,
        isActive: true,
      },
    });
  } catch (error) {
    logger.error('Error adding user to restaurant', { 
      userId, 
      restaurantId: inviteLink.restaurantId,
      error: error instanceof Error ? error.message : 'Unknown error' 
    });
    throw error;
  }
}

/**
 * Complete registration process
 */
async function completeRegistration(ctx: MyContext): Promise<void> {
  const token = ctx.session.inviteToken;
  const data = ctx.session.registrationData;

  if (!token || !data?.firstName || !data?.lastName) {
    await ctx.reply('❌ Ошибка при регистрации. Попробуйте заново.');
    await clearSession(ctx);
    return;
  }

  try {
    // Get invite link info
    const inviteResponse = await axios.get(`${API_BASE}/invite-links/token/${token}`);
    const inviteLink = inviteResponse.data.inviteLink as InviteLink;

    if (!ctx.from) {
      await ctx.reply('❌ Ошибка: не удалось определить пользователя');
      await clearSession(ctx);
      return;
    }

    const telegramId = ctx.telegramUserId;

    // Check if user with this telegramId exists
    const existingUserByTelegram = await dbClient.user.findFirst({
      where: { telegramId: telegramId },
    }) as { id: string; email: string } | null;

    let user: { id: string; email: string };

    if (existingUserByTelegram) {
      // User already exists - update their data
      user = await dbClient.user.update({
        where: { id: existingUserByTelegram.id },
        data: {
          firstName: data.firstName,
          lastName: data.lastName,
          phone: (data.phone && data.phone.trim() !== '-' && data.phone.trim() !== '') ? data.phone.trim() : null,
          isActive: true,
        },
      }) as { id: string; email: string };
    } else {
      // New user - create
      // Generate email (login)
      const firstNameClean = data.firstName.toLowerCase().replace(/[^a-zа-я0-9]/g, '');
      const lastNameClean = data.lastName.toLowerCase().replace(/[^a-zа-я0-9]/g, '');
      
      // Process phone - remove all non-digit characters
      let phoneDigits = '';
      if (data.phone && data.phone.trim() !== '-' && data.phone.trim() !== '') {
        phoneDigits = data.phone.replace(/\D/g, '');
      }
      
      // Form base email
      let baseEmail = `${firstNameClean}.${lastNameClean}`;
      if (phoneDigits && phoneDigits.length > 0) {
        baseEmail += `.${phoneDigits}`;
      }
      
      let email = `${baseEmail}@resto.local`;
      let counter = 1;
      
      // Check uniqueness and add counter if needed
      while (await dbClient.user.findUnique({ where: { email } })) {
        email = `${baseEmail}${counter}@resto.local`;
        counter++;
      }

      // Create user
      const bcrypt = require('bcryptjs');
      const passwordHash = await bcrypt.hash('Temp123!', 10);

      user = await dbClient.user.create({
        data: {
          email,
          passwordHash,
          firstName: data.firstName,
          lastName: data.lastName,
          phone: (data.phone && data.phone.trim() !== '-' && data.phone.trim() !== '') ? data.phone.trim() : null,
          telegramId: telegramId,
          role: 'EMPLOYEE',
          isActive: true,
        },
      }) as { id: string; email: string };
    }

    // Add user to restaurant
    try {
      await addUserToRestaurant(user.id, inviteLink);
    } catch (restaurantError: unknown) {
      logger.error('Error adding user to restaurant during registration', { 
        userId: user.id,
        error: restaurantError instanceof Error ? restaurantError.message : 'Unknown error' 
      });
      // If this is a new user, delete them on error
      if (!existingUserByTelegram) {
        await dbClient.user.delete({ where: { id: user.id } });
      }
      throw restaurantError;
    }

    const loginMessage = existingUserByTelegram
      ? `✅ Вы успешно добавлены в ресторан "${inviteLink.restaurant?.name}"!\n\n` +
        `Ваш логин: ${user.email}\n` +
        `Используйте пароль Temp123! для входа. Рекомендуем изменить пароль в личном кабинете.`
      : `✅ Регистрация успешна!\n\n` +
        `Добро пожаловать в ресторан "${inviteLink.restaurant?.name}"!\n\n` +
        `Ваш логин: ${user.email}\n` +
        `Временный пароль: Temp123!\n\n` +
        `Рекомендуем изменить пароль в личном кабинете.\n\n` +
        `Ссылка на приложение: http://localhost:5173/login`;

    await ctx.reply(loginMessage);

    // Clear session
    await clearSession(ctx);
  } catch (error: unknown) {
    logger.error('Registration error', { 
      telegramUserId: ctx.telegramUserId,
      error: error instanceof Error ? error.message : 'Unknown error' 
    });
    const errorMessage = error instanceof Error ? error.message : 'Ошибка при регистрации. Попробуйте позже или свяжитесь с менеджером.';
    await ctx.reply(`❌ ${errorMessage}`);
    await clearSession(ctx);
  }
}


/**
 * Start the Telegram bot
 */
export async function startBot(): Promise<void> {
  // Get token (now .env is loaded)
  const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
  
  if (!BOT_TOKEN) {
    logger.warn('TELEGRAM_BOT_TOKEN not set, bot will not start');
    return;
  }

  // Create bot with token
  bot = new Telegraf<MyContext>(BOT_TOKEN);
  
  // Add rate limiting middleware first (Requirements: 3.5)
  bot.use(rateLimitMiddleware);
  
  // Add session middleware
  bot.use(sessionMiddleware);

  // Start session cleanup scheduler
  const sessionService = getTelegramSessionService();
  sessionService.startCleanupScheduler();
  
  // Start rate limit cleanup scheduler
  startRateLimitCleanup(DEFAULT_RATE_LIMIT.windowMs);

  // Register commands
  bot.command('start', async (ctx: MyContext) => {
    if (!ctx.message || !('text' in ctx.message)) {
      await ctx.reply('❌ Неверный формат сообщения');
      return;
    }

    const token = ctx.message.text.split(' ')[1]; // Get token from /start TOKEN command

    if (token) {
      // Registration via invite link
      ctx.session.inviteToken = token;
      await saveSession(ctx);
      await handleInviteRegistration(ctx);
    } else {
      // Normal start
      await ctx.reply(
        '👋 Добро пожаловать в бот управления рестораном!\n\n' +
        'Для регистрации перейдите по пригласительной ссылке от менеджера.\n\n' +
        'Доступные команды:\n' +
        '/menu - Главное меню\n' +
        '/schedule - Мой график\n' +
        '/help - Помощь'
      );
    }
  });

  bot.command('menu', async (ctx: MyContext) => {
    if (!ctx.from) {
      await ctx.reply('❌ Ошибка: не удалось определить пользователя');
      return;
    }

    const telegramId = ctx.telegramUserId;
    const user = await dbClient.user.findFirst({
      where: { telegramId: telegramId },
      include: {
        restaurants: {
          where: { isActive: true },
          include: {
            restaurant: true,
          },
        },
      },
    }) as UserWithRestaurants | null;

    if (!user) {
      await ctx.reply('❌ Вы не зарегистрированы. Используйте пригласительную ссылку для регистрации.');
      return;
    }

    let message = `👤 ${user.firstName} ${user.lastName}\n\n`;
    message += `🏢 Ваши рестораны:\n`;

    user.restaurants.forEach((ru) => {
      message += `• ${ru.restaurant ? ru.restaurant.name : 'Неизвестный ресторан'}\n`;
    });

    message += `\n📋 Доступные команды:\n`;
    message += `/schedule - Мой график\n`;
    message += `/help - Помощь`;

    await ctx.reply(message);
  });

  bot.command('help', async (ctx: MyContext) => {
    await ctx.reply(
      '📖 Справка по боту\n\n' +
      'Команды:\n' +
      '/start [токен] - Начать работу или зарегистрироваться\n' +
      '/menu - Главное меню\n' +
      '/schedule - Мой график работы\n' +
      '/help - Эта справка\n\n' +
      'Для получения пригласительной ссылки обратитесь к менеджеру.'
    );
  });

  bot.on('text', async (ctx: MyContext) => {
    if (ctx.session.step === 'idle') {
      return;
    }

    if (!ctx.message || !('text' in ctx.message)) {
      return;
    }

    const text = ctx.message.text;
    const step = ctx.session.step;

    if (!ctx.session.registrationData) {
      ctx.session.registrationData = {};
    }

    if (step === 'awaiting_first_name') {
      ctx.session.registrationData.firstName = text;
      ctx.session.step = 'awaiting_last_name';
      await saveSession(ctx);
      await ctx.reply('Отлично! Теперь укажите вашу фамилию:');
    } else if (step === 'awaiting_last_name') {
      ctx.session.registrationData.lastName = text;
      ctx.session.step = 'awaiting_phone';
      await saveSession(ctx);
      await ctx.reply(
        'Отлично! Теперь укажите ваш номер телефона (можно в любом формате):'
      );
    } else if (step === 'awaiting_phone') {
      // If user entered "-" or empty string, consider phone empty
      ctx.session.registrationData.phone = (text.trim() === '-' || text.trim() === '') ? undefined : text.trim();
      await saveSession(ctx);
      await completeRegistration(ctx);
    }
  });

  bot.catch((err: unknown, ctx: MyContext) => {
    logger.error('Bot error', { 
      telegramUserId: ctx.telegramUserId,
      error: err instanceof Error ? err.message : 'Unknown error' 
    });
  });

  try {
    await bot.launch();
    logger.info(`Telegram bot started successfully (@${BOT_USERNAME})`);
    
    // Graceful shutdown
    process.once('SIGINT', () => {
      sessionService.stopCleanupScheduler();
      stopRateLimitCleanup();
      bot!.stop('SIGINT');
    });
    process.once('SIGTERM', () => {
      sessionService.stopCleanupScheduler();
      stopRateLimitCleanup();
      bot!.stop('SIGTERM');
    });
  } catch (error: unknown) {
    logger.error('Failed to start Telegram bot', { 
      error: error instanceof Error ? error.message : 'Unknown error' 
    });
  }
}

export { bot };
