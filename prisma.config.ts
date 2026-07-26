import { defineConfig } from 'prisma/config';

export default defineConfig({
    schema: './prisma/schema.prisma',
    // Prisma 7: datasource URL for migrations
    datasourceUrl: process.env.DATABASE_URL,
});
