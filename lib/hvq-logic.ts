export function calculateHVQ(stack: any[], pathItems: any[]) {
    const BASE_HVQ = 100;
  
    // 1. Stack Gains
    const tools = stack.filter(i => i.resource.type === 'ai_tool');
    const courses = stack.filter(i => i.resource.type === 'human_course' && i.status === 'completed');
    
    const toolPoints = tools.length * 5; // Infrastructure
    const coursePoints = courses.length * 20; // Intellectual Capital
  
    // 2. Path Progress (The Core of Delegation)
    // Assuming your path JSON contains tasks with an 'is_completed' state
    const completedTasks = pathItems.filter(t => t.is_completed).length;
    const pendingTasks = pathItems.filter(t => !t.is_completed).length;
  
    const delegationBonus = completedTasks * 15;
    const manualDebtPenalty = pendingTasks * 10;
  
    const finalScore = BASE_HVQ + toolPoints + coursePoints + delegationBonus - manualDebtPenalty;
  
    return Math.max(50, finalScore); // 50 is the absolute human floor
  }