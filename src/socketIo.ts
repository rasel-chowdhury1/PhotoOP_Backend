import { Server as SocketIOServer, Socket } from "socket.io";
import { Server as HttpServer } from "http";
import express, { Application } from "express";
import httpStatus from "http-status";
import AppError from "./app/error/AppError";
import { verifyToken } from "./app/utils/tokenManage";
import config from "./app/config";
import { User } from "./app/modules/user/user.model";
import mongoose from "mongoose";
import Notification from "./app/modules/notifications/notifications.model";
import colors from 'colors';
import { callbackFn } from "./app/utils/callbackFn";
import Message from "./app/modules/message/message.model";
import { Types } from "mongoose";
import Chat from "./app/modules/chat/chat.model";
import moment from 'moment-timezone';
import { ChatService } from "./app/modules/chat/chat.service";
import { NotificationType } from "./app/modules/notifications/notifications.interface";
import { isPushAllowed } from "./app/modules/notifications/notifications.utils";


// Define the socket server port
const socketPort: number = parseInt(process.env.SOCKET_PORT || "9020", 10);

const app: Application = express();

declare module "socket.io" {
  interface Socket {
    user?: {
      _id: string;
      name: string;
      email: string;
      profileImage?: string;
      role: string;
    };
  }
}

// Initialize the Socket.IO server
let io: SocketIOServer;

export const connectedUsers = new Map<
  string,
  {
    socketID: string;
  }
>();


console.log("connectedUsers ---->>> ", connectedUsers)



export const initSocketIO = async (server: HttpServer): Promise<void> => {
  console.log("🔧 Initializing Socket.IO server 🔧");

  const { Server } = await import("socket.io");

  io = new Server(server, {
    cors: {
      origin: "*", // Replace with your client's origin
      methods: ["GET", "POST"],
      allowedHeaders: ["my-custom-header"], // Add any custom headers if needed
      credentials: true,
    },
  });

  // Start the HTTP server on the specified port
  server.listen(socketPort, () => {
    console.log(
        //@ts-ignore
        `---> Socket server is listening on : http://${config.ip}:${config.socket_port}`
          .yellow.bold,
      );
  });

  // Authentication middleware: now takes the token from headers.
  io.use(async (socket: Socket, next: (err?: any) => void) => {
    // Extract token from headers (ensure your client sends it in headers)
    const token =
      (socket.handshake.auth.token as string) ||
      (socket.handshake.headers.token as string) ||
      (socket.handshake.headers.authorization as string);

    if (!token) {
      return next(
        new AppError(
          httpStatus.UNAUTHORIZED,
          "Authentication error: Token missing",
        ),
      );
    }

    let userDetails;
    try {
      userDetails = verifyToken({
        token,
        access_secret: config.jwt_access_secret as string,
      });
    } catch (err) {
      console.error('Socket JWT verify error:', err);
      return next(new Error('Authentication error: Invalid token'));
    }

    if (!userDetails) {
      return next(new Error("Authentication error: Invalid token"));
    }

    const user = await User.findById(userDetails.userId);
    if (!user) {
      return next(new Error("Authentication error: User not found"));
    }

    socket.user = {
        _id: user._id.toString(), // Convert _id to string if necessary
        name: user.fullName as string,
        profileImage: user.profileImage as string,
        email: user.email,
        role: user.role,
      };


    next();
  });


  io.on('connection', async (socket: Socket) => {
    // =================== try catch 1 start ================
    try {
      // Automatically register the connected user to avoid missing the "userConnected" event.
      if (socket.user && socket.user._id) {
        connectedUsers.set(socket.user._id.toString(), { socketID: socket.id });

        const unreadNotificationCount = await Notification.countDocuments({
          receiverId: socket.user._id,
          isRead: false,
        });

        emitMessage(socket.user._id.toString());

        socket.emit(`notification`, {
              statusCode: 200,
              success: true,
              unreadCount: unreadNotificationCount >= 0 ? unreadNotificationCount : 0,
              timestamp: new Date()
            });


      }



      // (Optional) In addition to auto-registering, you can still listen for a "userConnected" event if needed.
      socket.on('userConnected', ({ userId }: { userId: string }) => {
        connectedUsers.set(userId, { socketID: socket.id });
      });

      //----------------------online array send for front end------------------------//
      io.emit('onlineUser', Array.from(connectedUsers.keys()));

      // ===================== join by user id ================================
      // socket.join(user?._id?.toString());

        socket.on("readNotification", () => {

          if(!socket.user || !socket.user._id) return;

          const objectId = new Types.ObjectId(socket.user._id);

          // 1ï¸âƒ£ Fire-and-forget: mark as read asynchronously
          Notification.updateMany(
            { receiverId: objectId, isRead: false },
            { $set: { isRead: true } }
          ).catch(err => {
            console.error("Error updating notifications:", err);
          });

          // 2ï¸âƒ£ Immediately emit unread count (0)
          socket.emit(`notification`, {
              statusCode: 200,
              success: true,
              unreadCount: 0,
              timestamp: new Date()
            });
        });
      
      // ======= message send ====
      socket.on(
        'send-message',
        async (
          payload: { text: string; images: string[]; chatId: string },
          callback,
        ) => {
          try {
            const { chatId, text, images } = payload;
            if (!chatId) {
              return callbackFn(callback, {
                success: false,
                message: 'chatId is required',
              });
            }

            // âœ… Validate chat exists
            const chat = await Chat.findById(chatId).select('users');
            if (!chat) {
              return callbackFn(callback, {
                success: false,
                message: 'Chat not found',
              });
            }

            // âœ… Filter other users in chat
            const receivers = chat.users.filter(
              (u) => u.toString() !== socket.user?._id,
            );

            // âœ… Find online users
            const receiverSocketIds = receivers
              .map((u) => connectedUsers.get(u.toString())?.socketID)
              .filter((id): id is string => Boolean(id));

            // âœ… Format time in timezone
            const time = moment()
              .tz('Asia/Dhaka')
              .format('YYYY-MM-DDTHH:mm:ss.SSS');

            // âœ… Create message first (important!)
            const newMessage = await Message.create({
              sender: socket.user?._id,
              receiver: receivers[0],
              chat: chatId,
              text,
              images,
              time,
            });

            // âœ… Outgoing payload
            const messagePayload = {
              success: true,
              chatId,
              sender: socket.user?._id,
              text,
              images,
              time,
              messageId: newMessage._id,
            };

            // âœ… Emit to sender (local message)
            socket.emit(`message_received::${chatId}`, messagePayload);
            socket.emit('newMessage', messagePayload);
            // âœ… Emit only if receivers exist
            if (receiverSocketIds.length > 0) {

              io.to(receiverSocketIds).emit('newMessage', messagePayload);
              io.to(receiverSocketIds).emit(
                `message_received::${chatId}`,
                messagePayload,
              );
            }


                  // ============================================
      // CREATE MESSAGE NOTIFICATION
      // ============================================

        const receiverId = receivers[0];

        emitNotification({
          userId: socket.user?._id as any,
          receiverId: receiverId as any,

          userMsg: {
            fullName: socket.user?.name,
            image: socket.user?.profileImage || '',
            text:
              text ||
              `${socket.user?.name || 'Someone'} sent you a new message.`,
            photos: images || [],
          },

          type: NotificationType.NEW_MESSAGE,
        }).catch((error) => {
          console.error(
            'Failed to create message notification:',
            error,
          );
        });

            emitMessage(receivers[0].toString());


            // âœ… Reply callback

            callbackFn(callback, { success: true, message: messagePayload });
          } catch (err: any) {
            console.error('Socket send-message error:', err);
            callbackFn(callback, {
              success: false,
              message: err.message || 'Failed to send message',
            });

            io.emit('io-error', {
              success: false,
              message: 'Error sending message',
            });
          }
        },
      );

      // ======= read message ====
      socket.on('readMessage', async (_, callback) => {
        try {

          console.log("readMessage event hitteeddd =>>>>>>>>>>>>>>>> ");
console.log("socket user =>>>>>>>>>>> ", socket.user);

          const userId = socket.user?._id;

          console.log({userId})
          if (!userId) {
            return callbackFn(callback, { success: false, message: 'Unauthorized' });
          }

          // Mark ALL unseen messages sent by others to this user as seen
          const updated = await Message.updateMany(
            {  receiver: new Types.ObjectId(userId), seen: false },
            { $set: { seen: true }, $addToSet: { readBy: userId } },
          );

          callbackFn(callback, {
            success: true,
            message: `${updated.modifiedCount} message(s) marked as read`,
          });
        } catch (err: any) {
          console.error('Socket readMessage error:', err);
          callbackFn(callback, {
            success: false,
            message: err.message || 'Failed to mark messages as read',
          });
        }
      });

      //----------------------chat list start------------------------//
      socket.on('my-chat-list', async ({}, callback) => {
        try {
          const chatList = await ChatService.getMyChatList(
            (socket as any).user._id,
            {},
          );

          const userSocket = connectedUsers.get((socket as any).user._id);

          if (userSocket) {
            io.to(userSocket.socketID).emit('chat-list', chatList);
            callbackFn(callback, { success: true, message: chatList });
          }

          callbackFn(callback, {
            success: false,
            message: 'not found your socket id.',
          });
        } catch (error: any) {
          callbackFn(callback, {
            success: false,
            message: error.message,
          });

          io.emit('io-error', { success: false, message: error.message });
        }
      });
      //----------------------chat list end------------------------//

      //-----------------------Disconnect functionlity start ------------------------//
      socket.on('disconnect', () => {
        console.log(
          `${socket.user?.name} || ${socket.user?.email} || ${socket.user?._id} just disconnected with socket ID: ${socket.id}`,
        );

        // Remove user from connectedUsers map
        for (const [key, value] of connectedUsers.entries()) {
          if (value.socketID === socket.id) {
            connectedUsers.delete(key);
            break;
          }
        }

        io.emit('onlineUser', Array.from(connectedUsers.keys()));
      });
      //-----------------------Disconnect functionlity end ------------------------//
    } catch (error) {
      console.error('-- socket.io connection error --', error);

      // throw new Error(error)
      //-----------------------Disconnect functionlity start ------------------------//
      socket.on('disconnect', () => {
        console.log(
          `${socket.user?.name} || ${socket.user?.email} || ${socket.user?._id} just disconnected with socket ID: ${socket.id}`,
        );

        // Remove user from connectedUsers map
        for (const [key, value] of connectedUsers.entries()) {
          if (value.socketID === socket.id) {
            connectedUsers.delete(key);
            break;
          }
        }
        // io.emit('onlineUser', Array.from(connectedUsers));
        io.emit('onlineUser', Array.from(connectedUsers.keys()));
      });
      //-----------------------Disconnect functionlity end ------------------------//
    }
    // ==================== try catch 1 end ==================== //
  });


  
};

// Export the Socket.IO instance
export { io };




export const emitNotification = async ({
  userId,
  receiverId,
  userMsg,
  type
}: {
  userId: mongoose.Types.ObjectId | string;
  receiverId: mongoose.Types.ObjectId | string;
  userMsg?: {fullName?: string, image: string, text: string, photos?: string[]};
  type?: string;
}): Promise<void> => {

  if (!io) {
    throw new Error("Socket.IO is not initialized");
  }

  // Get the socket ID of the specific user
  const userSocket = connectedUsers.get(receiverId.toString());

  // Fetch unread notifications count for the receiver before creating the new notification
  const unreadCount = await Notification.countDocuments({
    receiverId: receiverId,
    isRead: false,  // Filter by unread notifications
  });

  // gate the real-time push on the receiver's notification settings — the in-app
  // Notification record below is always created regardless of this
  const receiver = await User.findById(receiverId).select("notificationSettings");
  const pushAllowed = isPushAllowed(receiver?.notificationSettings, type);

  console.log("userSocket ------>>>> ", userSocket);
  console.log("connected ---->>> ", connectedUsers)

  // Notify the specific user
  if (userMsg && userSocket && pushAllowed) {

    io.to(userSocket.socketID).emit(`notification`, {
      // userId,
      // message: userMsg,
      statusCode: 200,
      success: true,
      unreadCount: unreadCount >= 0 ? unreadCount + 1 : 1,
    });

  }

   // Save notification to the database
   const newNotification = {
    userId, // Ensure that userId is of type mongoose.Types.ObjectId
    receiverId, // Ensure that receiverId is of type mongoose.Types.ObjectId
    message: userMsg,
    type, // Use the provided type (default to "FollowRequest")
    isRead: false, // Set to false since the notification is unread initially
    timestamp: new Date(), // Timestamp of when the notification is created
  };

    // Save notification to the database
   const result = await Notification.create(newNotification);
   console.log({result})


 
};

export const emitMessage = async(userId: string) =>{

  if (!io) {
    throw new Error('Socket.IO is not initialized');
  }

  // Get the socket ID of the specific user
  const userSocket = connectedUsers.get(userId.toString());

  const unreadCount = await Message.countDocuments({
    receiver: new Types.ObjectId(userId),
    seen: false,
  });

  // Notify the specific user
  if ( userSocket) {
    io.to(userSocket.socketID).emit(`message_count`, {
      // userId,
      // message: userMsg,
      statusCode: 200,
      success: true,
      unreadCount: unreadCount >= 0 ? unreadCount : 1,
    });
  }
}

