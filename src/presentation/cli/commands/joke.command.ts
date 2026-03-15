/**
 * Joke Command
 *
 * Displays a random programming joke in the terminal.
 *
 * Usage: shep joke
 */

import { Command } from 'commander';
import { messages } from '../ui/index.js';

const JOKES: string[] = [
  'Why do programmers prefer dark mode?\nBecause light attracts bugs.',
  'A SQL query walks into a bar, sees two tables, and asks...\n"Can I JOIN you?"',
  "There are only 10 types of people in the world:\nthose who understand binary and those who don't.",
  "Why was the JavaScript developer sad?\nBecause he didn't Node how to Express himself.",
  'A programmer\'s wife tells him: "Go to the store and buy a loaf of bread. If they have eggs, buy a dozen."\nHe comes home with 12 loaves of bread.',
  "Why do Java developers wear glasses?\nBecause they can't C#.",
  "How many programmers does it take to change a light bulb?\nNone. That's a hardware problem.",
  '["hip","hip"]\n(hip hip array!)',
  "What's the object-oriented way to become wealthy?\nInheritance.",
  'A man is smoking a cigarette and blowing smoke rings into the air.\nHis girlfriend becomes irritated and says: "Can\'t you see the warning on the cigarette pack? Smoking is hazardous to your health!"\n"I\'m a programmer," he replies. "We don\'t worry about warnings. We only worry about errors."',
  'To understand what recursion is, you must first understand recursion.',
  'There are two hard things in computer science:\ncache invalidation, naming things, and off-by-one errors.',
  'Why did the developer go broke?\nBecause he used up all his cache.',
  "It works on my machine.\nThen we'll ship your machine.",
  'git commit -m "fixed bug"\ngit push\n// narrator: he did not fix the bug',
];

/**
 * Create the joke command
 */
export function createJokeCommand(): Command {
  return new Command('joke').description('Display a random programming joke').action(() => {
    const joke = JOKES[Math.floor(Math.random() * JOKES.length)];
    messages.newline();
    messages.log(joke);
    messages.newline();
  });
}
