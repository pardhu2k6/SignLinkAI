// level: easy = very distinct shapes · medium · tricky = look-alikes the camera can mix up · motion = needs movement (practice only)
const T = (label, level, tip, group) => ({ label, title: label, level, tip, group, xp: level === 'easy' ? 10 : 15 });
export const LESSONS = [
  T('A', 'tricky', 'Make a fist with the thumb resting against the SIDE of your index finger (thumb stays visible, not across the fingers).'),
  T('B', 'easy', 'Hold fingers straight up and pressed together. Fold your thumb across your palm.'),
  T('C', 'easy', 'Curve your fingers and thumb into the shape of the letter C.'),
  T('D', 'medium', 'Index finger points up. Middle, ring and pinky curl to touch the thumb tip, forming a small circle.'),
  T('E', 'tricky', 'Curl all fingertips down onto the palm and tuck the thumb underneath them.'),
  T('F', 'easy', 'Touch index finger and thumb tips in a circle. Keep middle, ring and pinky straight up and spread.'),
  T('G', 'medium', 'Index finger and thumb point sideways, parallel, like holding a small gap. Other fingers closed.'),
  T('H', 'medium', 'Index and middle fingers pointing sideways, together. Thumb tucked.'),
  T('I', 'easy', 'Make a fist and raise only your little finger.'),
  T('K', 'medium', 'Index and middle fingers up in a V; place your thumb between them, touching the middle finger.'),
  T('L', 'easy', 'Index finger up and thumb out sideways to make an L. Other fingers folded.'),
  T('M', 'tricky', 'Tuck your thumb under index, middle and ring fingers, which fold down over it.'),
  T('N', 'tricky', 'Tuck your thumb under the index and middle fingers, which fold down over it.'),
  T('O', 'easy', 'Curve all fingers to meet the thumb, making the shape of an O.'),
  T('P', 'medium', 'Same hand shape as K, but pointing downward.'),
  T('Q', 'medium', 'Same hand shape as G, but pointing downward.'),
  T('R', 'medium', 'Cross your middle finger over your index finger. Other fingers folded.'),
  T('S', 'tricky', 'Make a fist with the thumb wrapped across the FRONT of your fingers.'),
  T('T', 'tricky', 'Make a fist and poke your thumb up between the index and middle fingers.'),
  T('U', 'easy', 'Index and middle fingers straight up, held together. Others folded.'),
  T('V', 'easy', 'Index and middle fingers up and spread apart (peace sign).'),
  T('W', 'easy', 'Index, middle and ring fingers up and spread. Thumb holds the pinky down.'),
  T('X', 'medium', 'Make a fist and bend the index finger into a hook.'),
  T('Y', 'easy', 'Extend only your thumb and little finger (the "hang loose" shape).'),
  T('J', 'motion', 'Make the I shape (only your little finger up) and hold it for a moment. Then draw a big J in the air with your little finger: down, then hook toward yourself.'),
  T('Z', 'motion', 'Point your index finger up (other fingers folded) and hold for a moment. Then draw a big Z in the air: across, diagonal down, across.'),
].map(l => ({ ...l, cat: l.level }));
export const CATEGORIES = ['All', 'easy', 'medium', 'tricky', 'motion'];
export const LEVEL_NAMES = { easy: 'Easy', medium: 'Medium', tricky: 'Tricky look-alikes', motion: 'Motion (draw in the air)' };
export const LANGS = [['te', 'Telugu (తెలుగు)'], ['hi', 'Hindi (हिन्दी)'], ['ta', 'Tamil (தமிழ்)'], ['kn', 'Kannada (ಕನ್ನಡ)'], ['ml', 'Malayalam (മലയാളം)'], ['bn', 'Bengali (বাংলা)'], ['es', 'Spanish'], ['fr', 'French'], ['de', 'German']];
