import { Request, Response } from 'express';
import { messageService } from './message.service';
import sendResponse from '../../utils/sendResponse';
import httpStatus from 'http-status';
import catchAsync from '../../utils/catchAsync';
import { IChat } from '../chat/chat.interface';
import Chat from '../chat/chat.model';
import AppError from '../../error/AppError';
import { ChatService } from '../chat/chat.service';
import { storage } from '../../utils/storage';

const sendMessage = catchAsync(async (req: Request, res: Response) => {
  const {text, images, chatId} = req.body;
  const {userId} = req.user;

    // Validate input data
    if (!text || !chatId) {
       res.status(httpStatus.BAD_REQUEST).json({
        success: false,
        message: 'Text and chatId are required',
      });
    }
  

  const msgData ={
    text,
    images: images || [],
    sender: userId,
    chat: chatId
  }
  const result = await messageService.sendMessage(msgData);

  sendResponse(res, {
    statusCode: httpStatus.CREATED,
    success: true,
    message: 'Message sent successfully',
    data: result,
  });
});

const updateMessage = catchAsync(async (req: Request, res: Response) => {
  const {text} = req.body;
  const {userId} = req.user;
  const {msgId} = req.params;

    // Validate input data
    if (!text) {
       res.status(httpStatus.BAD_REQUEST).json({
        success: false,
        message: 'Text are required',
      });
    }
  

  const msgUpdateData ={
    userId,
    text,
    msgId
  }
  const result = await messageService.updateMessage(msgUpdateData);
  sendResponse(res, {
    statusCode: httpStatus.CREATED,
    success: true,
    message: 'Message updated successfully',
    data: result,
  });
});


//seen messages
const seenMessage = catchAsync(async (req: Request, res: Response) => {
  const chatList: IChat | null = await Chat.findById(req.params.chatId);

  if (!chatList) {
    throw new AppError(httpStatus.BAD_REQUEST, 'chat id is not valid');
  }

  const result = await messageService.seenMessage(
    req.user.userId,
    req.params.chatId,
  );



  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Message seen successfully',
    data: result,
  });
});

const deleteMessage = catchAsync(async (req: Request, res: Response) => {
  const {userId} = req.user;
  const {msgId} = req.params
  const result = await messageService.deleteMessage({userId, msgId});
  sendResponse(res, {
    statusCode: httpStatus.CREATED,
    success: true,
    message: 'Message deleted successfully',
    data: result,
  });
})

const getMessagesForChat = catchAsync(async (req: Request, res: Response) => {
  const {userId} = req.user;
  const result = await messageService.getMessagesForChat(req.params.chatId, userId, req.query);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    data: result,
    message: 'Messages fetched successfully',
  });
});


const fileUpload = catchAsync(async (req: Request, res: Response) => {

    let result;

      if (req.files) {
    try {
      const files = (req.files as { [fieldName: string]: Express.Multer.File[] }).images;

      // route through the configured IStorageAdapter (local or S3, per STORAGE_DRIVER)
      // instead of trusting multer's raw disk path directly
      if (files && files.length > 0) {
        const uploaded = await storage.saveMany(files, 'chat');
        result = uploaded.map((file) => file.url); // Assign full array of photo URLs
      }

    } catch (error: any) {
      console.error('Error processing files:', error.message);
      return sendResponse(res, {
        statusCode: httpStatus.BAD_REQUEST,
        success: false,
        message: 'Failed to process uploaded files',
        data: null,
      });
    }
  }
  sendResponse(res, {
    statusCode: httpStatus.CREATED,
    success: true,
    message: 'file upload successfully',
    data: result,
  });
});


const getAllPendingMessages = catchAsync(async (req: Request, res: Response) => {
  const messages = await messageService.getPendingMessages(req.query);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Pending messages retrieved successfully",
    data: messages,
  });
});


const approveMessage = catchAsync(async (req: Request, res: Response) => {
  const { messageId } = req.params;
  const result = await messageService.approveMessage(messageId);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Message approved successfully",
    data: result,
  });
});

const rejectMessage = catchAsync(async (req: Request, res: Response) => {
  const { messageId } = req.params;
  const result = await messageService.rejectMessage(messageId);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Message rejected successfully",
    data: result,
  });
});

export const messageController = {
  sendMessage,
  getMessagesForChat,
  updateMessage,
  seenMessage,
  deleteMessage,
  fileUpload,
  getAllPendingMessages,
  approveMessage,
  rejectMessage
};
