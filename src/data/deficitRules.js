export const DEFICIT_RULES = [
  { id:"iron", label:"Железодефицит", priority:100, test:/ферритин|железо(?!свя)|сыворот.*желез|гемоглобин/i },
  { id:"vitd", label:"Дефицит витамина D", priority:95, test:/витамин\s*d|25\s*\(?oh\)?\s*d|25-?он/i },
  { id:"b12", label:"Дефицит B12", priority:90, test:/\bb12\b|кобаламин/i },
  { id:"folate", label:"Дефицит фолатов", priority:85, test:/фолат|фолиев/i },
  { id:"magnesium", label:"Дефицит магния", priority:80, test:/магни/i },
  { id:"zinc", label:"Дефицит цинка", priority:75, test:/цинк/i },
  { id:"selenium", label:"Дефицит селена", priority:70, test:/селен/i },
  { id:"protein", label:"Белковый дефицит", priority:65, test:/общий белок|альбумин/i },
  { id:"omega3", label:"Дефицит омега-3", priority:60, test:/омега-?3/i }
];
