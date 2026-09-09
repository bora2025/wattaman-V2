import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { DatabaseModule } from './database/database.module';
import { SchoolBillingAccessGuard } from './marketplace/school-billing-access.guard';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { ScheduleModule } from '@nestjs/schedule';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { AttendanceModule } from './attendance/attendance.module';
import { NotificationModule } from './notification/notification.module';
import { ReportsModule } from './reports/reports.module';
import { ClassesModule } from './classes/classes.module';
import { SessionConfigModule } from './session-config/session-config.module';
import { HolidaysModule } from './holidays/holidays.module';
import { DepartmentsModule } from './departments/departments.module';
import { StudyYearsModule } from './study-years/study-years.module';
import { CardTemplatesModule } from './card-templates/card-templates.module';
import { TimetableModule } from './timetable/timetable.module';
import { ScoringModule } from './scoring/scoring.module';
import { FeesModule } from './fees/fees.module';
import { SalaryModule } from './salary/salary.module';
import { BusModule } from './bus/bus.module';
import { ExamModule } from './exam/exam.module';
import { AssignmentsModule } from './assignments/assignments.module';
import { CoursesModule } from './courses/courses.module';
import { ParentModule } from './parent/parent.module';
import { BackupModule } from './backup/backup.module';
import { AnnouncementsModule } from './announcements/announcements.module';
import { NotificationPreferenceModule } from './notification-preference/notification-preference.module';
import { AuditModule } from './audit/audit.module';
import { CardAliasesModule } from './card-aliases/card-aliases.module';
import { SiteSettingsModule } from './site-settings/site-settings.module';
import { PostsModule } from './posts/posts.module';
import { ClassRegistrationsModule } from './class-registrations/class-registrations.module';
import { StaffCvModule } from './staff-cv/staff-cv.module';
import { HealthModule } from './health/health.module';
import { InstallationModule } from './installation/installation.module';
import { PluginsModule } from './plugins/plugins.module';
import { UpdatesModule } from './updates/updates.module';
import { MarketplaceModule } from './marketplace/marketplace.module';
import { ObservabilityModule } from './observability/observability.module';
import { runsBackgroundJobs } from './config/environment';

@Module({
  imports: [
    // SchoolBillingAccessGuard is registered below as a global APP_GUARD, so Nest resolves its
    // dependencies from this module's own injector. Without DatabaseModule here its PrismaService
    // cannot be found and the whole application fails to start -- feature modules importing
    // DatabaseModule themselves does not help a provider declared at this level.
    DatabaseModule,
    // Rate limiting: max 300 requests per 60 seconds per IP
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 300 }]),
    ScheduleModule.forRoot({
      cronJobs: runsBackgroundJobs(),
      intervals: runsBackgroundJobs(),
      timeouts: runsBackgroundJobs(),
    }),
    AuditModule,
    AuthModule,
    AttendanceModule,
    NotificationModule,
    ReportsModule,
    ClassesModule,
    SessionConfigModule,
    HolidaysModule,
    DepartmentsModule,
    StudyYearsModule,
    CardTemplatesModule,
    TimetableModule,
    ScoringModule,
    FeesModule,
    SalaryModule,
    BusModule,
    ExamModule,
    AssignmentsModule,
    CoursesModule,
    ParentModule,
    BackupModule,
    AnnouncementsModule,
    NotificationPreferenceModule,
    CardAliasesModule,
    SiteSettingsModule,
    PostsModule,
    ClassRegistrationsModule,
    StaffCvModule,
    HealthModule,
    InstallationModule,
    PluginsModule,
    UpdatesModule,
    MarketplaceModule,
    ObservabilityModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    // Apply rate limiting globally to all endpoints
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: SchoolBillingAccessGuard },
  ],
})
export class AppModule {}
