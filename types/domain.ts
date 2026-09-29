export type Role='Super Admin'|'Meeting Secretary'|'Faculty / Officer'|'Member'|'Auditor';
export type MeetingStatus='Draft'|'Transcribed'|'Pending Approval'|'Approved'|'Rejected'|'Published';
export type MeetingType='online'|'offline';
export type ActionStatus='Pending'|'In Progress'|'Completed';
export type PolicyStatus='Draft'|'Under Review'|'Approved'|'Archived';
export type NotificationType='meeting'|'approval'|'task'|'policy'|'system';
export interface Profile{ id:string; email:string; role:Role; department:string|null; created_at:string; }
export interface Meeting{ id:string; title:string; date:string; location:string|null; type:MeetingType; status:MeetingStatus; created_by:string; assigned_approver_id:string|null; }
export interface Decision{ id:string; meeting_id:string; minute_id:string; decision_text:string; action_item:string|null; assignee_id:string|null; due_date:string|null; status:ActionStatus; }
export interface Policy{ id:string; title:string; content:string; version:number; status:PolicyStatus; effective_date:string|null; updated_by:string|null; updated_at:string; }
export interface PolicyVersion{ id:string; policy_id:string; version:number; title:string; content:string; status:PolicyStatus; effective_date:string|null; change_reason:string|null; created_by:string|null; approved_by:string|null; created_at:string; }
export interface Notification{ id:string; type:NotificationType; title:string; message:string; target_table:string|null; target_id:string|null; read_at:string|null; created_at:string; }
export interface SearchResult{parent_type:string;parent_id:string;chunk_content:string;metadata:Record<string,unknown>;similarity:number;}
export interface AIActionItem{decision_text:string;action_item:string;assignee_email:string|null;due_date:string|null;}
export interface AISummary{executive_summary:string;key_points:string[];risks:string[];next_steps:string[];suggested_minutes?:string;}
