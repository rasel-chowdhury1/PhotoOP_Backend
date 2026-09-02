import { Request, Response } from 'express';
import httpStatus from 'http-status';
import { ZodError } from 'zod';
import AppError from '../../error/AppError';
import { storage } from '../../utils/storage';
import { GuardianApprovalStatus } from '../user/user.interface';
import { guardianService } from './guardian.service';

type MulterFiles = { [fieldname: string]: Express.Multer.File[] } | undefined;

// this flow is a browser page for guardians, not a JSON API — errors are rendered as
// HTML here instead of being forwarded to globalErrorHandler (which only emits JSON)
const renderGuardianError = (res: Response, error: unknown) => {
  const isInvalidOrExpiredLink =
    error instanceof AppError && error.statusCode === httpStatus.FORBIDDEN;
  const statusCode = error instanceof AppError ? error.statusCode : httpStatus.INTERNAL_SERVER_ERROR;
  const message =
    error instanceof AppError
      ? error.message
      : 'Something went wrong while processing your request. Please try again later.';

  res.status(statusCode).render('guardian/status', {
    statusType: isInvalidOrExpiredLink ? 'expired' : 'failed',
    title: isInvalidOrExpiredLink ? 'Link Invalid or Expired' : 'Verification Failed',
    message,
  });
};

const renderAlreadyVerified = (res: Response, status: GuardianApprovalStatus) => {
  res.render('guardian/status', {
    statusType: 'already-verified',
    title: 'Verification Already Completed',
    message: `This guardian consent request has already been ${status.toLowerCase()}. No further action is needed.`,
  });
};

const showVerificationForm = async (req: Request, res: Response) => {
  try {
    const token = req.query.token as string | undefined;
    const context = await guardianService.getVerificationContext(token);

    if (context.view === 'already-verified') {
      return renderAlreadyVerified(res, context.status);
    }

    res.render('guardian/verify-form', {
      token: context.token,
      child: context.child,
      error: null,
    });
  } catch (error) {
    renderGuardianError(res, error);
  }
};

const submitVerification = async (req: Request, res: Response) => {
  const token = (req.body?.token as string) || (req.query.token as string) || undefined;
  const files = req.files as MulterFiles;

  try {
    const idImage = files?.idImage?.[0]
      ? (await storage.save(files.idImage[0], 'guardian')).url
      : undefined;

    const result = await guardianService.submitVerification({
      token,
      decision: req.body?.decision,
      guardianName: req.body?.guardianName,
      relation: req.body?.relation,
      phoneNumber: req.body?.phoneNumber,
      emergencyContactName: req.body?.emergencyContactName,
      emergencyContactPhone: req.body?.emergencyContactPhone,
      reason: req.body?.reason,
      idImage,
    });

    if (result.view === 'already-verified') {
      return renderAlreadyVerified(res, result.status);
    }

    const approved = result.decision === GuardianApprovalStatus.APPROVED;

    res.render('guardian/status', {
      statusType: 'success',
      title: approved ? 'Account Approved' : 'Account Declined',
      message: approved
        ? "Thank you! You've successfully approved your child's PhotoOp Snapper account. They can now start using PhotoOp."
        : "You've declined this request. Your child's PhotoOp Snapper account will not be activated.",
    });
  } catch (error) {
    if (error instanceof ZodError) {
      // re-show the form with the validation message instead of a dead-end error page
      try {
        const context = await guardianService.getVerificationContext(token);
        if (context.view === 'form') {
          return res.status(httpStatus.BAD_REQUEST).render('guardian/verify-form', {
            token: context.token,
            child: context.child,
            error: error.issues[0]?.message || 'Please complete all required fields.',
          });
        }
        if (context.view === 'already-verified') {
          return renderAlreadyVerified(res, context.status);
        }
      } catch (innerError) {
        return renderGuardianError(res, innerError);
      }
    }

    renderGuardianError(res, error);
  }
};

export const guardianController = {
  showVerificationForm,
  submitVerification,
};
