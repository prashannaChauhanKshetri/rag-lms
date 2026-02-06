export interface User {
    id: string;
    username: string;
    full_name: string;
    email: string;
    role: 'student' | 'instructor' | 'admin' | 'super_admin';
    institution?: string;
}

export interface Chatbot {
    id: string;
    name: string;
    greeting: string;
    external_knowledge_ratio: number;
    created_at: string;
    updated_at: string;
    description?: string; // Optional metadata
}

export interface Conversation {
    id: string;
    chatbot_id: string;
    question: string;
    answer: string;
    sources: Array<{ source: string; text: string; page?: string }>;
    timestamp: string;
}

export interface Document {
    id?: number;
    filename: string;
    chunk_count: number;
    upload_date: string;
}

// Instructor: Chatbot Creation
export interface CreateChatbotRequest {
    name: string;
    greeting: string;
    external_knowledge_ratio: number;
}

// Instructor: Quiz & Questions
export interface Question {
    question_text: string;
    question_type: 'mcq' | 'true_false' | 'very_short_answer' | 'short_answer' | 'long_answer';
    options?: string[];
    correct_answer: string;
}

export interface GeneratedQuiz {
    questions: Question[];
}

export interface GenerateQuestionsRequest {
    chatbot_id: string;
    topic?: string;
    count?: number;
    difficulty?: string;
    types?: string[];
}

// Instructor: Lesson Plan
export interface GenerateLessonPlanRequest {
    chatbot_id: string;
    topic: string;
    duration?: string;
}

export interface LessonPlanResponse {
    lesson_plan: string;
}

export interface AuthResponse {
    message: string;
    user: User;
    access_token: string;
}

export interface ApiError {
    detail: string;
}
