const mongoose = require('mongoose');
const Problem = require('./models/Problem');

const defaultProblems = [
  { week: "Week 1: Arrays, Two Pointers, Sliding Window", categories: [
    { name: "Two Pointers", items: [
      {n:"Valid Palindrome", est:15},{n:"Two Sum II (sorted array)", est:20},{n:"3Sum", est:35},
      {n:"Container With Most Water", est:30},{n:"Trapping Rain Water", est:50}
    ]},
    { name: "Sliding Window", items: [
      {n:"Best Time to Buy and Sell Stock", est:15},{n:"Longest Substring Without Repeating Characters", est:30},
      {n:"Longest Repeating Character Replacement", est:35},{n:"Minimum Window Substring", est:50},
      {n:"Sliding Window Maximum", est:45}
    ]}
  ]},
  { week: "Week 1-2: Hashing & Stack", categories: [
    { name: "Hashing", items: [
      {n:"Two Sum", est:15},{n:"Group Anagrams", est:25},{n:"Top K Frequent Elements", est:30},
      {n:"Product of Array Except Self", est:25},{n:"Valid Sudoku", est:30},{n:"Longest Consecutive Sequence", est:35}
    ]},
    { name: "Stack", items: [
      {n:"Valid Parentheses", est:15},{n:"Min Stack", est:25},{n:"Evaluate Reverse Polish Notation", est:25},
      {n:"Generate Parentheses", est:30},{n:"Daily Temperatures", est:30},{n:"Largest Rectangle in Histogram", est:50}
    ]}
  ]},
  { week: "Week 2: Linked Lists", categories: [
    { name: "Linked Lists", items: [
      {n:"Reverse Linked List", est:15},{n:"Merge Two Sorted Lists", est:20},{n:"Reorder List", est:30},
      {n:"Remove Nth Node From End of List", est:25},{n:"Linked List Cycle", est:20},
      {n:"Merge K Sorted Lists", est:45},{n:"LRU Cache", est:40}
    ]}
  ]},
  { week: "Week 2-3: Binary Search", categories: [
    { name: "Binary Search", items: [
      {n:"Binary Search (basic)", est:15},{n:"Search in Rotated Sorted Array", est:30},
      {n:"Find Minimum in Rotated Sorted Array", est:25},{n:"Time Based Key-Value Store", est:30},
      {n:"Median of Two Sorted Arrays", est:50},{n:"Find Peak Element", est:25},
      {n:"Capacity To Ship Packages Within D Days", est:35}
    ]}
  ]},
  { week: "Week 3: Trees", categories: [
    { name: "Trees", items: [
      {n:"Invert Binary Tree", est:15},{n:"Maximum Depth of Binary Tree", est:15},{n:"Diameter of Binary Tree", est:20},
      {n:"Balanced Binary Tree", est:20},{n:"Same Tree", est:15},{n:"Subtree of Another Tree", est:20},
      {n:"Lowest Common Ancestor of a BST", est:20},{n:"Binary Tree Level Order Traversal", est:25},
      {n:"Validate Binary Search Tree", est:25},{n:"Kth Smallest Element in a BST", est:25},
      {n:"Construct Binary Tree from Preorder and Inorder Traversal", est:35},
      {n:"Binary Tree Maximum Path Sum", est:45},{n:"Serialize and Deserialize Binary Tree", est:40}
    ]}
  ]},
  { week: "Week 3-4: Heaps & Backtracking", categories: [
    { name: "Heap / Priority Queue", items: [
      {n:"Kth Largest Element in a Stream", est:20},{n:"Last Stone Weight", est:20},
      {n:"K Closest Points to Origin", est:25},{n:"Task Scheduler", est:35},{n:"Find Median from Data Stream", est:40}
    ]},
    { name: "Backtracking", items: [
      {n:"Subsets", est:25},{n:"Combination Sum", est:30},{n:"Permutations", est:25},
      {n:"Word Search", est:35},{n:"Palindrome Partitioning", est:35},{n:"N-Queens", est:45}
    ]}
  ]},
  { week: "Week 4-5: Graphs", categories: [
    { name: "Graphs", items: [
      {n:"Number of Islands", est:25},{n:"Clone Graph", est:25},{n:"Max Area of Island", est:25},
      {n:"Pacific Atlantic Water Flow", est:35},{n:"Course Schedule", est:30},{n:"Course Schedule II", est:35},
      {n:"Number of Connected Components in an Undirected Graph", est:30},{n:"Redundant Connection", est:30},
      {n:"Word Ladder", est:45},{n:"Network Delay Time", est:35}
    ]}
  ]},
  { week: "Week 5-7: Dynamic Programming", categories: [
    { name: "1D DP", items: [
      {n:"Climbing Stairs", est:15},{n:"House Robber", est:20},{n:"House Robber II", est:25},
      {n:"Longest Increasing Subsequence", est:35},{n:"Word Break", est:35},{n:"Coin Change", est:30},
      {n:"Maximum Product Subarray", est:30},{n:"Decode Ways", est:30}
    ]},
    { name: "2D DP", items: [
      {n:"Unique Paths", est:20},{n:"Longest Common Subsequence", est:30},
      {n:"Best Time to Buy and Sell Stock with Cooldown", est:35},{n:"Edit Distance", est:40},
      {n:"Target Sum", est:30},{n:"Interleaving String", est:40}
    ]},
    { name: "Knapsack-style", items: [
      {n:"Partition Equal Subset Sum", est:30}
    ]}
  ]},
  { week: "Week 7: Greedy & Intervals", categories: [
    { name: "Greedy & Intervals", items: [
      {n:"Maximum Subarray", est:15},{n:"Jump Game", est:25},{n:"Gas Station", est:30},
      {n:"Insert Interval", est:25},{n:"Merge Intervals", est:25},{n:"Non-overlapping Intervals", est:25},
      {n:"Meeting Rooms II", est:25}
    ]}
  ]}
];

const seedDB = async () => {
  try {
    const count = await Problem.countDocuments({ isCustom: false });
    if (count === 0) {
      console.log('Seeding default DSA problem list into MongoDB...');
      let orderIndex = 0;
      const docsToInsert = [];
      
      for (const wk of defaultProblems) {
        for (const cat of wk.categories) {
          for (const item of cat.items) {
            docsToInsert.push({
              week: wk.week,
              category: cat.name,
              name: item.n,
              est: item.est,
              order: orderIndex++,
              isCustom: false,
              userId: null
            });
          }
        }
      }
      
      await Problem.insertMany(docsToInsert);
      console.log(`Successfully seeded ${docsToInsert.length} problems!`);
    } else {
      console.log('Database already seeded with default problems.');
    }
  } catch (error) {
    console.error(`Error seeding database: ${error.message}`);
  }
};

module.exports = seedDB;
