import { Injectable } from '@nestjs/common';
import sgMail from '@sendgrid/mail';
import twilio from 'twilio';
import { PrismaService } from '../database/prisma.service';

@Injectable()
export class NotificationService {
  private twilioClient: twilio.Twilio | null = null;

  constructor(private prisma: PrismaService) {
    const apiKey = process.env.SENDGRID_API_KEY;
    if (apiKey) {
      sgMail.setApiKey(apiKey);
    }
    if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) {
      this.twilioClient = twilio(
        process.env.TWILIO_ACCOUNT_SID,
        process.env.TWILIO_AUTH_TOKEN,
      );
    }
  }

  async sendAbsenceNotification(studentId: string) {
    const student = await this.prisma.student.findUnique({
      where: { id: studentId },
      include: { 
        user: true, 
        parent: true
      },
    });

    if (!student || !student.parent) return;

    const parent = student.parent as any;
    const message = `Your child ${student.user.name} was marked absent today.`;

    // Send email (skip if no API key configured)
    if (parent.email && process.env.SENDGRID_API_KEY) {
      try {
        await sgMail.send({
          to: parent.email,
          from: 'noreply@attendancesystem.com',
          subject: 'Student Absence Notification',
          text: message,
        });
      } catch (err) {
        console.error('SendGrid email failed:', err?.message || err);
      }
    }

    // Send SMS (skip if no credentials configured)
    if (parent.phone && this.twilioClient && process.env.TWILIO_PHONE_NUMBER) {
      try {
        await this.twilioClient.messages.create({
          body: message,
          from: process.env.TWILIO_PHONE_NUMBER,
          to: parent.phone,
        });
      } catch (err) {
        console.error('Twilio SMS failed:', err?.message || err);
      }
    }

    // Log notification
    try {
      await this.prisma.notification.create({
        data: {
          userId: parent.id,
          message,
          type: 'absence',
        },
      });
    } catch (err) {
      console.error('Failed to log notification:', err?.message || err);
    }
  }

  /** Generic email dispatcher used by announcements and future notifications. */
  async sendEmail(to: string, subject: string, text: string) {
    if (!process.env.SENDGRID_API_KEY) return { skipped: true, reason: 'no-api-key' };
    await sgMail.send({
      to,
      from: process.env.SENDGRID_FROM || 'noreply@attendancesystem.com',
      subject,
      text,
    });
    return { sent: true };
  }

  /** Generic SMS dispatcher used by announcements and future notifications. */
  async sendSms(to: string, body: string) {
    if (!this.twilioClient || !process.env.TWILIO_PHONE_NUMBER) {
      return { skipped: true, reason: 'no-twilio' };
    }
    await this.twilioClient.messages.create({
      body,
      from: process.env.TWILIO_PHONE_NUMBER,
      to,
    });
    return { sent: true };
  }
}