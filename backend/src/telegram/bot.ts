import { Telegraf, Context, session } from 'telegraf';
import { PrismaClient } from '@prisma/client';
import axios from 'axios';

const prisma = new PrismaClient();

// Интерфейс сессии пользователя
interface SessionData {
  step?: string;
  inviteToken?: string;
  registrationData?: {
    firstName?: string;
    lastName?: string;
    phone?: string;
  };
}

type MyContext = Context & { session: SessionData };

// Инициализация бота
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const BOT_USERNAME = process.env.TELEGRAM_BOT_USERNAME || 'myResto_robot';
const API_BASE = process.env.API_BASE_URL || 'http://localhost:3001/api';

const bot = new Telegraf<MyContext>(BOT_TOKEN);

// Middleware для сессий (простая реализация в памяти)
const sessions = new Map<number, SessionData>();

bot.use((ctx, next) => {
  const userId = ctx.from?.id;
  if (userId) {
    if (!sessions.has(userId)) {
      sessions.set(userId, {});
    }
    ctx.session = sessions.get(userId)!;
  }
  return next();
});

// Команда /start - начало работы с ботом
bot.command('start', async (ctx: MyContext) => {
  if (!ctx.message || !('text' in ctx.message)) {
    await ctx.reply('❌ Неверный формат сообщения');
    return;
  }

  const token = ctx.message.text.split(' ')[1]; // Получаем токен из команды /start TOKEN

  if (token) {
    // Регистрация по пригласительной ссылке
    ctx.session.inviteToken = token;
    await handleInviteRegistration(ctx);
  } else {
    // Обычный старт
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

// Обработка регистрации по пригласительной ссылке
async function handleInviteRegistration(ctx: MyContext) {
  const token = ctx.session.inviteToken;

  if (!token) {
    await ctx.reply('❌ Токен приглашения не найден');
    return;
  }

  try {
    // Получаем информацию о приглашении
    const inviteResponse = await axios.get(`${API_BASE}/invite-links/token/${token}`);
    const inviteLink = inviteResponse.data.inviteLink;

    if (!ctx.from) {
      await ctx.reply('❌ Ошибка: не удалось определить пользователя');
      return;
    }

    const telegramId = String(ctx.from.id);

    // Если ссылка без ресторана - это привязка Telegram
    if (!inviteLink.restaurantId) {
      await handleTelegramBinding(ctx, inviteLink, telegramId);
      return;
    }

    // Проверяем, зарегистрирован ли пользователь
    // @ts-ignore - telegramId exists in schema but TypeScript types may not be updated
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    const existingUser = await prisma.user.findFirst({
      where: { telegramId: telegramId } as any,
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
    } as any) as any;

    // Проверяем, не зарегистрирован ли уже в этом ресторане
    if (existingUser) {
      const alreadyInRestaurant = existingUser.restaurants.length > 0;

      if (alreadyInRestaurant) {
        await ctx.reply(
          `✅ Вы уже зарегистрированы в ресторане "${inviteLink.restaurant.name}"`
        );
        ctx.session.inviteToken = undefined;
        return;
      }

      // Если пользователь существует, но не в этом ресторане (или был удален),
      // то просим его пройти регистрацию заново для этого ресторана
      // Это позволяет корректно обработать случай, когда сотрудник был удален
      ctx.session.step = 'registration_firstName';
      await ctx.reply(
        `👋 Добро пожаловать!\n\n` +
        `Вы были приглашены в ресторан "${inviteLink.restaurant.name}".\n\n` +
        `Для регистрации укажите ваше имя:`
      );
      return;
    }

    // Новый пользователь - запрашиваем данные для регистрации
    ctx.session.step = 'registration_firstName';
    await ctx.reply(
      `👋 Добро пожаловать!\n\n` +
      `Вы были приглашены в ресторан "${inviteLink.restaurant.name}".\n\n` +
      `Для регистрации укажите ваше имя:`
    );
  } catch (error: any) {
    console.error('[Bot] Invite registration error:', {
      message: error.message,
      status: error.response?.status,
      data: error.response?.data,
      token: token,
    });
    
    if (error.response?.status === 404) {
      await ctx.reply('❌ Пригласительная ссылка недействительна или истекла.\n\nПожалуйста, создайте новую ссылку в профиле.');
    } else if (error.response?.status === 400) {
      const errorMessage = error.response?.data?.error || 'Ссылка недействительна';
      await ctx.reply(`❌ ${errorMessage}\n\nПожалуйста, создайте новую ссылку в профиле.`);
    } else {
      await ctx.reply('❌ Ошибка при обработке приглашения. Попробуйте позже или создайте новую ссылку.');
    }
    ctx.session.inviteToken = undefined;
  }
}

// Обработка привязки Telegram аккаунта
async function handleTelegramBinding(ctx: MyContext, inviteLink: any, telegramId: string) {
  try {
    // Находим пользователя по createdById из inviteLink
    const user = await prisma.user.findUnique({
      where: { id: inviteLink.createdById },
      select: { id: true, firstName: true, lastName: true, telegramId: true } as any,
    }) as { id: string; firstName: string; lastName: string; telegramId: string | null } | null;

    if (!user) {
      await ctx.reply('❌ Пользователь не найден');
      ctx.session.inviteToken = undefined;
      return;
    }

    // Проверяем, не привязан ли уже Telegram к другому аккаунту
    // @ts-ignore
    const existingUserWithTelegram = await prisma.user.findFirst({
      where: { telegramId: telegramId } as any,
      select: { id: true },
    } as any) as { id: string } | null;

    if (existingUserWithTelegram && existingUserWithTelegram.id !== user.id) {
      await ctx.reply('❌ Этот Telegram аккаунт уже привязан к другому пользователю');
      ctx.session.inviteToken = undefined;
      return;
    }

    // Привязываем Telegram к аккаунту
    await prisma.user.update({
      where: { id: user.id },
      data: { telegramId: telegramId } as any,
    });

    // Деактивируем ссылку
    await (prisma as any).inviteLink.update({
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

    ctx.session.inviteToken = undefined;
  } catch (error: any) {
    console.error('Telegram binding error:', error);
    await ctx.reply('❌ Ошибка при привязке Telegram. Попробуйте позже.');
    ctx.session.inviteToken = undefined;
  }
}

// Добавление пользователя в ресторан
async function addUserToRestaurant(userId: string, inviteLink: any) {
  try {
    // Используем API для использования ссылки
    await axios.post(`${API_BASE}/invite-links/use`, {
      token: inviteLink.token,
    });

    // Проверяем, не добавлен ли уже в этот ресторан (только активные записи)
    const existing = await prisma.restaurantUser.findFirst({
      where: {
        restaurantId: inviteLink.restaurantId,
        userId: userId,
        isActive: true,
      },
    });

    if (existing) {
      return; // Уже добавлен
    }
    
    // Если запись существует, но неактивна - удаляем её, чтобы создать новую
    const inactiveRecord = await prisma.restaurantUser.findUnique({
      where: {
        restaurantId_userId: {
          restaurantId: inviteLink.restaurantId,
          userId: userId,
        },
      },
    });
    
    if (inactiveRecord && !inactiveRecord.isActive) {
      await prisma.restaurantUser.delete({
        where: {
          restaurantId_userId: {
            restaurantId: inviteLink.restaurantId,
            userId: userId,
          },
        },
      });
    }

    // Определяем positionId - используем из inviteLink или находим первую доступную должность
    let positionId = inviteLink.positionId;
    if (!positionId) {
      const defaultPosition = await prisma.position.findFirst({
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

    // Добавляем пользователя в ресторан
    await prisma.restaurantUser.create({
      data: {
        restaurantId: inviteLink.restaurantId,
        userId: userId,
        positionId: positionId,
        departmentId: inviteLink.departmentId || null,
        isActive: true,
      },
    });
  } catch (error) {
    console.error('Error adding user to restaurant:', error);
    throw error;
  }
}

// Обработка текстовых сообщений (для регистрации)
bot.on('text', async (ctx: MyContext) => {
  if (!ctx.session.step) {
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

  if (step === 'registration_firstName') {
    ctx.session.registrationData.firstName = text;
    ctx.session.step = 'registration_lastName';
    await ctx.reply('Отлично! Теперь укажите вашу фамилию:');
  } else if (step === 'registration_lastName') {
    ctx.session.registrationData.lastName = text;
    ctx.session.step = 'registration_phone';
    await ctx.reply(
      'Отлично! Теперь укажите ваш номер телефона (можно в любом формате):'
    );
  } else if (step === 'registration_phone') {
    // Если пользователь ввел "-" или пустую строку, считаем телефон пустым
    ctx.session.registrationData.phone = (text.trim() === '-' || text.trim() === '') ? undefined : text.trim();
    await completeRegistration(ctx);
  }
});

// Завершение регистрации
async function completeRegistration(ctx: MyContext) {
  const token = ctx.session.inviteToken;
  const data = ctx.session.registrationData;

  if (!token || !data?.firstName || !data?.lastName) {
    await ctx.reply('❌ Ошибка при регистрации. Попробуйте заново.');
    ctx.session = {};
    return;
  }

  try {
    // Получаем информацию о приглашении
    const inviteResponse = await axios.get(`${API_BASE}/invite-links/token/${token}`);
    const inviteLink = inviteResponse.data.inviteLink;

    if (!ctx.from) {
      await ctx.reply('❌ Ошибка: не удалось определить пользователя');
      ctx.session = {};
      return;
    }

    const telegramId = String(ctx.from.id);

    // Проверяем, существует ли пользователь с таким telegramId
    // @ts-ignore
    const existingUserByTelegram = await prisma.user.findFirst({
      where: { telegramId: telegramId } as any,
    }) as any;

    let user: any;

    if (existingUserByTelegram) {
      // Пользователь уже существует - обновляем его данные
      user = await prisma.user.update({
        where: { id: existingUserByTelegram.id },
        data: {
          firstName: data.firstName,
          lastName: data.lastName,
          phone: (data.phone && data.phone.trim() !== '-' && data.phone.trim() !== '') ? data.phone.trim() : null,
          isActive: true,
        },
      });
    } else {
      // Новый пользователь - создаем
      // Генерируем email (логин)
      const firstNameClean = data.firstName.toLowerCase().replace(/[^a-zа-я0-9]/g, '');
      const lastNameClean = data.lastName.toLowerCase().replace(/[^a-zа-я0-9]/g, '');
      
      // Обрабатываем телефон - убираем все нецифровые символы
      let phoneDigits = '';
      if (data.phone && data.phone.trim() !== '-' && data.phone.trim() !== '') {
        phoneDigits = data.phone.replace(/\D/g, '');
      }
      
      // Формируем базовый email
      let baseEmail = `${firstNameClean}.${lastNameClean}`;
      if (phoneDigits && phoneDigits.length > 0) {
        baseEmail += `.${phoneDigits}`;
      }
      
      let email = `${baseEmail}@resto.local`;
      let counter = 1;
      
      // Проверяем уникальность и добавляем счетчик, если нужно
      while (await prisma.user.findUnique({ where: { email } })) {
        email = `${baseEmail}${counter}@resto.local`;
        counter++;
      }

      // Создаем пользователя
      const bcrypt = require('bcryptjs');
      const passwordHash = await bcrypt.hash('Temp123!', 10);

      user = await (prisma.user.create({
        data: {
          email,
          passwordHash,
          firstName: data.firstName,
          lastName: data.lastName,
          phone: (data.phone && data.phone.trim() !== '-' && data.phone.trim() !== '') ? data.phone.trim() : null,
          telegramId: telegramId as any,
          role: 'EMPLOYEE',
          isActive: true,
        } as any,
      }) as any);
    }

    // Добавляем пользователя в ресторан
    try {
      await addUserToRestaurant(user.id, inviteLink);
    } catch (restaurantError: any) {
      console.error('Error adding user to restaurant:', restaurantError);
      // Если это новый пользователь, удаляем его при ошибке
      if (!existingUserByTelegram) {
        await prisma.user.delete({ where: { id: user.id } });
      }
      throw restaurantError;
    }

    const loginMessage = existingUserByTelegram
      ? `✅ Вы успешно добавлены в ресторан "${inviteLink.restaurant.name}"!\n\n` +
        `Ваш логин: ${user.email}\n` +
        `Используйте пароль Temp123! для входа. Рекомендуем изменить пароль в личном кабинете.`
      : `✅ Регистрация успешна!\n\n` +
        `Добро пожаловать в ресторан "${inviteLink.restaurant.name}"!\n\n` +
        `Ваш логин: ${user.email}\n` +
        `Временный пароль: Temp123!\n\n` +
        `Рекомендуем изменить пароль в личном кабинете.\n\n` +
        `Ссылка на приложение: http://localhost:5173/login`;
        

    await ctx.reply(loginMessage);

    // Очищаем сессию
    ctx.session = {};
  } catch (error: any) {
    console.error('Registration error:', error);
    const errorMessage = error.message || 'Ошибка при регистрации. Попробуйте позже или свяжитесь с менеджером.';
    await ctx.reply(`❌ ${errorMessage}`);
    ctx.session = {};
  }
}

// Команда /menu - главное меню
bot.command('menu', async (ctx: MyContext) => {
  if (!ctx.from) {
    await ctx.reply('❌ Ошибка: не удалось определить пользователя');
    return;
  }

  const telegramId = String(ctx.from.id);
  // @ts-ignore - telegramId exists in schema but TypeScript types may not be updated
  const user = await prisma.user.findFirst({
    where: { telegramId: telegramId } as any,
    include: {
      restaurants: {
        where: { isActive: true },
        include: {
          restaurant: true,
        },
      },
    },
  } as any) as any;

  if (!user) {
    await ctx.reply('❌ Вы не зарегистрированы. Используйте пригласительную ссылку для регистрации.');
    return;
  }

  let message = `👤 ${user.firstName} ${user.lastName}\n\n`;
  message += `🏢 Ваши рестораны:\n`;

  user.restaurants.forEach((ru: any) => {
    message += `• ${ru.restaurant.name}\n`;
  });

  message += `\n📋 Доступные команды:\n`;
  message += `/schedule - Мой график\n`;
  message += `/help - Помощь`;

  await ctx.reply(message);
});

// Команда /help
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

// Обработка ошибок
bot.catch((err: any, ctx: MyContext) => {
  console.error('Bot error:', err);
});

// Запуск бота
export async function startBot() {
  if (!BOT_TOKEN) {
    console.warn('⚠️  TELEGRAM_BOT_TOKEN not set, bot will not start');
    return;
  }

  try {
    await bot.launch();
    console.log(`🤖 Telegram bot started successfully (@${BOT_USERNAME})`);
    
    // Graceful остановка
    process.once('SIGINT', () => bot.stop('SIGINT'));
    process.once('SIGTERM', () => bot.stop('SIGTERM'));
  } catch (error: any) {
    console.error('❌ Failed to start Telegram bot:', error.message);
    if (error.response) {
      console.error('   Telegram API response:', error.response);
    }
  }
}

export { bot };

