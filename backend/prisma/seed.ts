import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
import { addDays, setHours, setMinutes, startOfDay } from 'date-fns';

// Загружаем переменные окружения
dotenv.config();

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Начало seeding...');

  // Проверяем, есть ли уже админ
  const existingAdmin = await prisma.user.findFirst({
    where: {
      role: {
        in: ['OWNER', 'ADMIN'],
      },
    },
  });

  if (existingAdmin) {
    console.log('✅ Администратор уже существует:', existingAdmin.email);
  } else {

  // Создаем главного админа
  const adminEmail = process.env.ADMIN_EMAIL || 'admin@resto.local';
  const adminPassword = process.env.ADMIN_PASSWORD || 'Admin123!';
  const passwordHash = await bcrypt.hash(adminPassword, 10);

  const admin = await prisma.user.create({
    data: {
      email: adminEmail,
      passwordHash,
      firstName: 'Главный',
      lastName: 'Администратор',
      role: 'OWNER',
      isActive: true,
    },
  });

    console.log('✅ Главный администратор создан:');
    console.log('   Email:', admin.email);
    console.log('   Пароль:', adminPassword);
    console.log('   Роль:', admin.role);
    console.log('');
  }

  // Создаем базовые типы смен (общие шаблоны) - всегда
  const defaultTemplates = [
    { name: 'Полная смена (9:00-18:00)', startHour: 9, endHour: 18, color: '#3b82f6' },
    { name: 'Утренняя смена (9:00-15:00)', startHour: 9, endHour: 15, color: '#10b981' },
    { name: 'Вечерняя смена (15:00-23:00)', startHour: 15, endHour: 23, color: '#f59e0b' },
    { name: 'Частичная смена (10:00-14:00)', startHour: 10, endHour: 14, color: '#8b5cf6' },
  ];

  for (const template of defaultTemplates) {
    // Проверяем, существует ли уже такой шаблон
    const existing = await prisma.shiftTemplate.findFirst({
      where: {
        name: template.name,
        restaurantId: null,
      },
    });

    if (!existing) {
      await prisma.shiftTemplate.create({
        data: {
          name: template.name,
          startHour: template.startHour,
          endHour: template.endHour,
          color: template.color,
          restaurantId: null, // Общие шаблоны
          isActive: true,
        },
      });
    }
  }

  console.log('✅ Созданы базовые типы смен');

  // Создаем базовые права доступа
  const permissions = [
    // Рестораны
    { code: 'VIEW_RESTAURANTS', name: 'Просмотр ресторанов', category: 'RESTAURANTS', description: 'Просмотр списка ресторанов' },
    { code: 'EDIT_RESTAURANTS', name: 'Редактирование ресторанов', category: 'RESTAURANTS', description: 'Создание и редактирование ресторанов' },
    
    // График работы
    { code: 'VIEW_SCHEDULE', name: 'Просмотр графика', category: 'SCHEDULE', description: 'Просмотр графика работы' },
    { code: 'EDIT_SCHEDULE', name: 'Редактирование графика', category: 'SCHEDULE', description: 'Создание и редактирование графика работы' },
    
    // Типы смен
    { code: 'VIEW_SHIFT_TYPES', name: 'Просмотр типов смен', category: 'SHIFT_TYPES', description: 'Просмотр типов смен' },
    { code: 'EDIT_SHIFT_TYPES', name: 'Редактирование типов смен', category: 'SHIFT_TYPES', description: 'Создание и редактирование типов смен' },
    
    // Задачи
    { code: 'VIEW_OWN_TASKS', name: 'Просмотр своих задач', category: 'TASKS', description: 'Просмотр только своих задач (где исполнитель или создатель)' },
    { code: 'VIEW_ALL_TASKS', name: 'Просмотр всех задач ресторана', category: 'TASKS', description: 'Просмотр всех задач ресторана' },
    { code: 'EDIT_TASKS', name: 'Редактирование задач', category: 'TASKS', description: 'Создание и редактирование задач' },
    
    // Табели
    { code: 'VIEW_OWN_TIMESHEETS', name: 'Просмотр своих табелей', category: 'TIMESHEETS', description: 'Просмотр только своих табелей и зарплаты' },
    { code: 'VIEW_ALL_TIMESHEETS', name: 'Просмотр всех табелей ресторана', category: 'TIMESHEETS', description: 'Просмотр всех табелей ресторана' },
    { code: 'EDIT_TIMESHEETS', name: 'Редактирование табелей', category: 'TIMESHEETS', description: 'Редактирование табелей рабочего времени' },
    
    // Сотрудники
    { code: 'VIEW_EMPLOYEES', name: 'Просмотр сотрудников', category: 'EMPLOYEES', description: 'Просмотр списка сотрудников' },
    { code: 'EDIT_EMPLOYEES', name: 'Редактирование сотрудников', category: 'EMPLOYEES', description: 'Добавление и редактирование сотрудников' },
    
    // Должности
    { code: 'VIEW_POSITIONS', name: 'Просмотр должностей', category: 'POSITIONS', description: 'Просмотр списка должностей' },
    { code: 'EDIT_POSITIONS', name: 'Редактирование должностей', category: 'POSITIONS', description: 'Создание и редактирование должностей' },
    
    // Отделы
    { code: 'VIEW_DEPARTMENTS', name: 'Просмотр отделов', category: 'DEPARTMENTS', description: 'Просмотр списка отделов' },
    { code: 'EDIT_DEPARTMENTS', name: 'Редактирование отделов', category: 'DEPARTMENTS', description: 'Создание и редактирование отделов' },
  ];

  let createdPermissions = 0;
  for (const perm of permissions) {
    const existing = await prisma.permission.findUnique({
      where: { code: perm.code },
    });

    if (!existing) {
      await prisma.permission.create({
        data: perm,
      });
      createdPermissions++;
    }
  }

  if (createdPermissions > 0) {
    console.log(`✅ Создано ${createdPermissions} базовых прав доступа`);
  } else {
    console.log('✅ Базовые права доступа уже существуют');
  }

  await seedDemoData();

  console.log('');
  console.log('⚠️  ВАЖНО: Сохраните эти данные для входа!');
}

async function seedDemoData() {
  console.log('🌿 Обновляю демо-ресторан и сотрудников...');

  const adminUser = await prisma.user.findFirst({
    where: { role: { in: ['OWNER', 'ADMIN'] } },
  });

  const demoRestaurant =
    (await prisma.restaurant.findFirst({ where: { name: 'Демо ресторан' } })) ||
    (await prisma.restaurant.create({
      data: {
        name: 'Демо ресторан',
        address: 'г. Москва, ул. Примерная, д.1',
        managerId: adminUser?.id,
      },
    }));

  const demoDepartment =
    (await prisma.department.findFirst({ where: { restaurantId: demoRestaurant.id, name: 'Зал' } })) ||
    (await prisma.department.create({
      data: {
        restaurantId: demoRestaurant.id,
        name: 'Зал',
      },
    }));

  // Создаем должности (idempotent)
  const positionData = [
    { name: 'Менеджер', code: 'manager' },
    { name: 'Официант', code: 'waiter' },
    { name: 'Бармен', code: 'barman' },
  ];

  const positions = [];
  for (const p of positionData) {
    const existing = await prisma.position.findFirst({
      where: { restaurantId: demoRestaurant.id, name: p.name },
    });
    if (existing) {
      positions.push(existing);
    } else {
      positions.push(
        await prisma.position.create({
          data: {
            restaurantId: demoRestaurant.id,
            name: p.name,
          },
        })
      );
    }
  }

  const posByCode: Record<string, string> = {
    manager: positions.find((p) => p.name === 'Менеджер')!.id,
    waiter: positions.find((p) => p.name === 'Официант')!.id,
    barman: positions.find((p) => p.name === 'Бармен')!.id,
  };

  // Подтягиваем permissions
  const perm = async (code: string) =>
    (await prisma.permission.findUnique({ where: { code } }))?.id;

  const managerPerms = (
    await Promise.all(
      [
        'VIEW_SCHEDULE',
        'EDIT_SCHEDULE',
        'VIEW_SHIFT_TYPES',
        'EDIT_SHIFT_TYPES',
        'VIEW_OWN_TASKS',
        'VIEW_ALL_TASKS',
        'EDIT_TASKS',
        'VIEW_OWN_TIMESHEETS',
        'VIEW_ALL_TIMESHEETS',
        'EDIT_TIMESHEETS',
        'VIEW_EMPLOYEES',
        'EDIT_EMPLOYEES',
        'VIEW_POSITIONS',
        'EDIT_POSITIONS',
        'VIEW_DEPARTMENTS',
        'EDIT_DEPARTMENTS',
        'VIEW_RESTAURANTS',
      ].map(perm)
    )
  ).filter(Boolean) as string[];

  const staffPerms = (
    await Promise.all(
      ['VIEW_SCHEDULE', 'VIEW_OWN_TASKS', 'VIEW_OWN_TIMESHEETS'].map(perm)
    )
  ).filter(Boolean) as string[];

  const grantPerms = async (positionId: string, permIds: string[]) => {
    await Promise.all(
      permIds.map((pid) =>
        prisma.positionPermission.upsert({
          where: { positionId_permissionId: { positionId, permissionId: pid } },
          update: {},
          create: { positionId, permissionId: pid },
        })
      )
    );
  };

  await grantPerms(posByCode.manager, managerPerms);
  await grantPerms(posByCode.waiter, staffPerms);
  await grantPerms(posByCode.barman, staffPerms);

  // Создаем сотрудников (пользователей)
  const demoUsersData = [
    { email: 'manager@resto.local', firstName: 'Иван', lastName: 'Менеджеров', role: 'MANAGER', positionCode: 'manager' },
    { email: 'waiter@resto.local', firstName: 'Мария', lastName: 'Сотрудникова', role: 'EMPLOYEE', positionCode: 'waiter' },
    { email: 'barman@resto.local', firstName: 'Петр', lastName: 'Барменов', role: 'EMPLOYEE', positionCode: 'barman' },
  ];

  const demoPassword = process.env.DEMO_PASSWORD || 'Demo123!';
  const demoUsers = [];
  for (const u of demoUsersData) {
    const existing = await prisma.user.findUnique({ where: { email: u.email } });
    if (existing) {
      demoUsers.push(existing);
      continue;
    }
    const created = await prisma.user.create({
      data: {
        email: u.email,
        passwordHash: await bcrypt.hash(demoPassword, 10),
        firstName: u.firstName,
        lastName: u.lastName,
        role: u.role,
        isActive: true,
      },
    });
    demoUsers.push(created);
  }

  // Привязываем к ресторану
  for (const user of demoUsers) {
    const posCode = demoUsersData.find((d) => d.email === user.email)?.positionCode || 'waiter';
    await prisma.restaurantUser.upsert({
      where: {
        restaurantId_userId: { restaurantId: demoRestaurant.id, userId: user.id },
      },
      update: {},
      create: {
        restaurantId: demoRestaurant.id,
        userId: user.id,
        positionId: posByCode[posCode],
        departmentId: demoDepartment.id,
      },
    });
  }

  // Создаем несколько смен на ближайшие 5 дней, если их еще нет
  const existingDemoShifts = await prisma.shift.count({ where: { restaurantId: demoRestaurant.id } });
  if (existingDemoShifts === 0) {
    const templates = await prisma.shiftTemplate.findMany({
      where: { restaurantId: null },
      take: 3,
    });
    const template = templates[0];
    if (template) {
      const today = startOfDay(new Date());
      const employees = demoUsers;
      const shiftsData = [];
      for (let i = 0; i < 5; i++) {
        const day = addDays(today, i);
        const startTime = setMinutes(setHours(day, template.startHour), 0);
        const endTime = setMinutes(setHours(day, template.endHour), 0);
        const hours = template.endHour - template.startHour;
        const user = employees[i % employees.length];
        shiftsData.push({
          restaurantId: demoRestaurant.id,
          userId: user.id,
          type: template.id,
          startTime,
          endTime,
          hours,
          isConfirmed: true,
        });
      }
      await prisma.shift.createMany({ data: shiftsData });
      console.log('✅ Добавлены демо-смены');
    }
  }

  console.log('✅ Демо-ресторан и сотрудники созданы');
  console.log('   Логины: manager@resto.local / waiter@resto.local / barman@resto.local');
  console.log('   Пароль (общий):', demoPassword);
}
main()
  .catch((e) => {
    console.error('❌ Ошибка при seeding:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

