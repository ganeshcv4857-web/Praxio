// Data-layer entry point: Supabase when configured, otherwise the local demo store.
import { isConfigured } from './supabase.js';
import * as remote from './supabaseDb.js';
import * as demo from './demoDb.js';

const impl = isConfigured ? remote : demo;

export const saveGeneratedOutput = (...a) => impl.saveGeneratedOutput(...a);
export const getLatestGeneratedOutput = (...a) => impl.getLatestGeneratedOutput(...a);
export const getAssessmentSession = (...a) => impl.getAssessmentSession(...a);
export const saveAssessmentDraft = (...a) => impl.saveAssessmentDraft(...a);
export const completeAssessmentSession = (...a) => impl.completeAssessmentSession(...a);
export const getProfile = (...a) => impl.getProfile(...a);
export const saveProfile = (...a) => impl.saveProfile(...a);
export const getRecommendations = (...a) => impl.getRecommendations(...a);
export const replaceRecommendations = (...a) => impl.replaceRecommendations(...a);
export const saveExplanations = (...a) => impl.saveExplanations(...a);
export const listChatSessions = (...a) => impl.listChatSessions(...a);
export const createChatSession = (...a) => impl.createChatSession(...a);
export const deleteChatSession = (...a) => impl.deleteChatSession(...a);
export const getChatMessages = (...a) => impl.getChatMessages(...a);
export const addChatMessage = (...a) => impl.addChatMessage(...a);
export const getFeasibility = (...a) => impl.getFeasibility(...a);
export const saveFeasibility = (...a) => impl.saveFeasibility(...a);
export const getDevelopment = (...a) => impl.getDevelopment(...a);
export const saveDevelopmentPlan = (...a) => impl.saveDevelopmentPlan(...a);
export const startCourse = (...a) => impl.startCourse(...a);
export const setCourseCompleted = (...a) => impl.setCourseCompleted(...a);
export const completeModule = (...a) => impl.completeModule(...a);
export const createChallenge = (...a) => impl.createChallenge(...a);
export const submitProject = (...a) => impl.submitProject(...a);
export const recordEvaluation = (...a) => impl.recordEvaluation(...a);
