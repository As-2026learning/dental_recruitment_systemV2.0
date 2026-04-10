/**
 * Supabase 配置文件
 * 
 * 使用说明：
 * 1. 将下面的 YOUR_SUPABASE_URL 替换为您在Supabase控制台获取的 Project URL
 * 2. 将 YOUR_SUPABASE_ANON_KEY 替换为您在Supabase控制台获取的 anon public key
 */

// 全局配置变量
window.SUPABASE_URL = 'https://dxrghlqnwfwpuxjvyisv.supabase.co';
window.SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR4cmdobHFud2Z3cHV4anZ5aXN2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ2ODYyMjAsImV4cCI6MjA5MDI2MjIyMH0.r6hDrTVZ1p_Qq6sHuLeBEo3SFqGEh0trwbRMXLWnrNQ';
const TIME_SLOTS = {
  morning: {
    label: '上午场 (09:00-10:30)',
    capacity: 15
  },
  afternoon: {
    label: '下午场 (13:00-15:30)',
    capacity: 25
  }
};

// 可预约的工作日（周一至周五）
const WORKING_DAYS = [1, 2, 3, 4, 5]; // 0=周日, 1=周一, ..., 6=周六

// 预约提前时间限制（小时）
const BOOKING_ADVANCE_HOURS = 2;

// 可预约的未来天数
const MAX_BOOKING_DAYS = 30;

// 岗位列表（可根据实际需求修改）
const POSITIONS = [
  '义齿设计师',
  'CAD/CAM技术员',
  '模型制作员',
  '烤瓷技术员',
  '质检员',
  '生产主管',
  '其他'
];
