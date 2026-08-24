import express, { NextFunction, Request, Response } from 'express';
import fileUpload from '../../middleware/fileUpload';
import parseData from '../../middleware/parseData';
import { ChatController } from './chat.controller';
import auth from '../../middleware/auth';
import { User } from '../user/user.model';
import { USER_ROLE } from '../user/user.constants';

const router = express.Router();

// Add a new chat
router.post(
  '/create',
  auth(
    USER_ROLE.USER,
    USER_ROLE.SNAPPER,
    USER_ROLE.ADMIN
  ),
  ChatController.addNewChat,
);

router.get(
  '/my-chat-list',
  auth(
    USER_ROLE.USER,
    USER_ROLE.SNAPPER,
    USER_ROLE.ADMIN
  ),
  ChatController.getMyChatList,
);

router.get(
  '/all-users',
  auth(
    USER_ROLE.USER,
    USER_ROLE.SNAPPER,
    USER_ROLE.ADMIN
  ),
  ChatController.getAllUserQueryForChat
)

router.patch(
  '/leave-chat/:chatId',
  auth(
    USER_ROLE.USER,
    USER_ROLE.SNAPPER,
    USER_ROLE.ADMIN
  ),
  ChatController.leaveUserFromSpecificChatController,
);

router.get(
  '/:chatId',
  auth(
    USER_ROLE.USER,
    USER_ROLE.SNAPPER,
    USER_ROLE.ADMIN
  ),
  ChatController.getChatById,
);


export const ChatRoutes = router;
