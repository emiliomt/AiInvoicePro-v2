import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Bot, Play, Clock, CheckCircle, XCircle, Eye, Download, RefreshCw, Settings, Wifi } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';