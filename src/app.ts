/* eslint-disable no-undef */
/* eslint-disable no-unused-vars */
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-explicit-any */
import cookieParser from 'cookie-parser';
import cors from 'cors';
import path from 'path';
import express, { Application, Request, Response } from 'express';
import globalErrorHandler from './app/middleware/globalErrorhandler';
// import notFound from './app/middleware/notfound';
import router from './app/routes';
import notFound from './app/middleware/notfound';
import serverHomePage from './app/helpers/serverHomePage';
import { guardianRoutes } from './app/modules/guardian/guardian.route';
import { paymentRoutes } from './app/modules/payment/payment.route';
import { logHttpRequests } from './app/utils/logger';
const app: Application = express();

app.use(express.static('public'));
app.use(express.urlencoded({ extended: true }));

// server-rendered guardian verification pages (not compiled by tsc, so read
// straight from src/ the same way public/ assets are, both in dev and prod)
app.set('view engine', 'ejs');
app.set('views', path.join(process.cwd(), 'src', 'views'));

app.use(logHttpRequests);

// Stripe webhook needs the raw, unparsed request body to verify its signature, so it
// must be mounted BEFORE express.json() below strips that away — see payment.route.ts
app.use('/api/v1/payment', paymentRoutes);

//parsers
app.use(express.json());
app.use(cookieParser());

app.use(
  cors({
    origin: true,
    // origin: '',
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
  }),
);

// Remove duplicate static middleware
// app.use(app.static('public'));

// application routes
app.use('/api/v1', router);

// server-rendered guardian consent pages (browser-facing, outside the JSON API)
app.use('/guardian', guardianRoutes);

app.get('/', async (req: Request, res: Response) => {
  const htmlContent = await serverHomePage(); // Wait for HTML generation
  res.send(htmlContent); // Send the generated HTML
});

app.use(globalErrorHandler);

//Not Found
app.use(notFound);

export default app;
