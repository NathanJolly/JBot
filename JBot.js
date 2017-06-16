const Objects = require('./Objects.js');
const request = require('request');
const jsdom = require('jsdom');
const {JSDOM} = jsdom;

const Discord = require('discord.js');
const client = new Discord.Client();

const prefix = "J!";
const commands = new Map();
commands.set(prefix + "join", new Objects.Command("Join the game.", join));
commands.set(prefix + "newgame", new Objects.Command("Load a new game.", newGame));
commands.set(prefix + "clue", new Objects.Command("Display a clue by category and clue number", displayClue));
commands.set(prefix, new Objects.Command("Respond to the current clue", handleResponse));
commands.set(prefix + "judge", new Objects.Command("Judge adjustment mode", judgeMode));

client.on('ready', () => 
{
  console.log('JBot is ready.');
});

var game_url;
var responses_url;
function getUrls() 
{
	var game_number = (Math.floor(Math.random() * 5777) + 1).toString();
	game_url = "http://www.j-archive.com/showgame.php?game_id=" + game_number;
	responses_url = "http://www.j-archive.com/showgameresponses.php?game_id=" + game_number;
	console.log(game_url);
	console.log(responses_url);
}

var game_dom = null;
var responses_dom = null;

var game_board = new Array(7);

var players = [];

var current_clue = null;

client.on('message', message => 
{
	if (message.content.startsWith(prefix) === false)
	{
		return;
	}
	
	const nick = message.guild.members.get(message.author.id).nickname;
	const display_name = message.author.tag + (nick !== null ? " (" + nick + ")" : "");
	
	var command_until_space = message.content;
	if (message.content.indexOf(' ') !== -1)
	{
		command_until_space = message.content.substr(0,message.content.indexOf(' '));
	}
		
	if (commands.get(command_until_space) !== undefined)
	{
		commands.get(command_until_space).invoke(message, display_name);
	}
	else
	{
		var commands_string = "Commands:\n";
	
		for (var [name, command] of commands)
		{
			commands_string += "\n" + name + ": " + command.description;
		}
		
		message.channel.send(commands_string);
	}
});

function join(message, display_name)
{
	for (var i in players)
	{
		if (players[i].tag === message.author.tag)
		{
			message.channel.send(display_name + ", you are already in this game.");
			return;								 
		}
	}
	
	if (players.length < 3)
	{
		players.push(new Objects.Player(message.author.tag, display_name));
		message.channel.send(display_name + " has joined the game.");
						
		if (players.length === 3)
		{
			message.channel.send("The game is full and will start in 1 minute with players " +
								 players[0].display_name + ", " +
								 players[1].display_name + ", and " +
								 players[2].display_name + ", " + ".");			
		}
	}
	
	else
	{
		message.channel.send("Sorry, " + display_name + ", but the game is full.");
	}
}

var category_strings = [];
function newGame(message, display_name)
{
	if (players.length > 0)
	{
		message.channel.send("Starting a new game.");
		game_dom = null;
		responses_dom = null;
		
		getUrls();
		request(game_url, function(error, response, ton_of_html) 
		{
			request(responses_url, function (error, response, responses_body)
			{
				responses_dom = new JSDOM(responses_body);
				
				game_dom = new JSDOM(ton_of_html);
				
				if (game_dom.window.document.getElementsByClassName('error').length === 1)
				{
					newGame(message, display_name);
					return;
				}
				var categories = game_dom.window.document.getElementsByClassName('category_name');
				
				if (categories.length === 0)
				{
					newGame(message.display_name);
					return;
				}
				
				category_strings = [];
				category_strings.push(categories[0].textContent);
				category_strings.push(categories[1].textContent);
				category_strings.push(categories[2].textContent);
				category_strings.push(categories[3].textContent);
				category_strings.push(categories[4].textContent);
				category_strings.push(categories[5].textContent);
				
				var response_elements = responses_dom.window.document.getElementsByClassName('correct_response');
				var responses = [];
				
				var response_index = 0;
				for (var i = 1; i < 6; ++i)
				{
					for (var j = 1; j < 7; ++j)
					{
						if (game_dom.window.document.getElementById(
							'clue_J_' + 
							(j).toString() + '_' +
							(i).toString()) !== null)
						{
							responses.push(response_elements[response_index].textContent);
							response_index++;
						}
						else
						{
							responses.push("N/A");
						}
					}
				}
				
				for (var i = 1; i < 7; ++i)
				{
					response_index = i - 1;
					game_board[i] = new Array(6);
					
					for (var j = 1; j < 6; ++j)
					{
						var clue_text = "This clue was not revealed during the real game.";
						
						if (game_dom.window.document.getElementById(
											'clue_J_' + 
											(i).toString() + '_' +
											(j).toString()) !== null)
						{
							clue_text = game_dom.window.document.getElementById(
											'clue_J_' + 
											(i).toString() + '_' +
											(j).toString()).textContent;
						}
						
						game_board[i][j] = new Objects.Clue(
								category_strings[i - 1],
								clue_text, 
								responses[response_index], 
								(j * 200));
								
						response_index += 6;
					}
				}
				
				refreshForNewClue(message.channel);

			});
		});
	}
	else
	{
		message.channel.send("Nobody is playing. Say J!join to join.");
	}
}

var clue_timer;
function displayClue(message, display_name)
{
	if (current_clue === null)
	{
		var command_hint = null;
		var command_after_space = message.content.substr(message.content.indexOf(' ') + 1);
		if (command_after_space.length === 2)
		{
			var regex = /[1-6][1-5]/;
			if (regex.test(command_after_space))
			{
				var numbers = parseInt(command_after_space);
				var category = Math.floor(numbers / 10);
				var clue_index = numbers % 10;
			
				if (game_board[category][clue_index].answered)
				{
					command_hint = "This clue has already been answered.";
				}
				else
				{
					current_clue = game_board[category][clue_index];
					
					for (var i in players)
					{
						players[i].eligible_to_answer = true;
					}
					
					message.channel.send("Category: " + category_strings[category - 1] + ", Value: $" + current_clue.value + "\n" + current_clue.text);
					clue_timer = setTimeout(clueTimeout, 15000, message.channel);
				}
			}
			else
			{
				command_hint = "Command must be in the format 'J!clue XY', where X is the category (1-6) and Y is the clue number (1-5).";
			}
		}
		else
		{
			command_hint = "Command must be in the format 'J!clue XY', where X is the category (1-6) and Y is the clue number (1-5).";
		}
		
		if (command_hint !== null)
		{
			message.channel.send(command_hint);
		}
	}
	else
	{
		message.channel.send("There is already a clue in play: " + current_clue.text);
	}
}

function clueTimeout(channel)
{
	if (current_clue !== null)
	{		
		channel.send("Time's up. The correct response was: " + current_clue.answer);
		
		refreshForNewClue(channel);
	}
}

function handleResponse(message, display_name)
{
	if (current_clue !== null)
	{
		var responding_player = getPlayer(display_name);
		
		if (responding_player === null)
		{
			message.channel.send("Sorry " + display_name + ", but you are not playing.");
			return;
		}
		
		if (responding_player.eligible_to_answer === false)
		{
			message.channel.send("Sorry " + display_name + ", but you have already responded to this clue.");
			return;
		}
		
		responding_player.eligible_to_answer = false;
		
		var command_after_space = message.content.substr(message.content.indexOf(' ') + 1);
		
		if (compareResponses(command_after_space, current_clue.answer)) 
		{
			message.channel.send(current_clue.answer + " is correct.");
			responding_player.money += current_clue.value;
			message.channel.send(display_name + 
				" now has $" + responding_player.money + 
				"(+" + current_clue.value + ")");					
			
			refreshForNewClue(message.channel);
		}
		else
		{
			responding_player.money -= current_clue.value;
			message.channel.send(command_after_space + " is incorrect.");
			message.channel.send(display_name + 
				" now has $" + responding_player.money + 
				"(-" + current_clue.value + ")");
			
			for (var i in players)
			{
				if (players[i].eligible_to_answer === true)
				{
					return;
				}
			}
			
			message.channel.send("There are no more eligible players. The correct answer was " + current_clue.answer);
			refreshForNewClue(message.channel);
		}
	}
}

function refreshForNewClue(channel)
{
	clearTimeout(clue_timer);

	if (current_clue !== null)
	{
		current_clue.answered = true;
	}
	
	current_clue = null;
	
	for (var i in players)
	{
		players[i].eligible_to_answer = true;
	}
	
	printAvailableClues(channel);
	printPlayers(channel);
}

function getPlayer(display_name)
{
	for (var i in players)
	{
		if (players[i].display_name === display_name)
		{
			return players[i];
		}
	}
	
	return null;
}

function printAvailableClues(channel)
{
	var anything_left = false;
	var master_string = "**Available Clues**\n";

		for (var i in game_board)
		{
			master_string += i + ": " + category_strings[i - 1] + "\n    ";
			for (var j in game_board[i])
			{				
				if (game_board[i][j].answered === false)
				{
					anything_left = true;
					master_string += j + ": $" + game_board[i][j].value + "    ";
				}
			}
			master_string += "\n\n";
		}
	
	if (anything_left === false)
	{
		endRound(channel);
	}
	else
	{
		channel.send(master_string);
	}
}

function printPlayers(channel)
{
	var master_string = "**Player Totals**\n    ";
	
	for (var i in players)
	{
		master_string += players[i].display_name + ": $" + players[i].money + "\n    ";
	}
	
	channel.send(master_string);
}

function endRound(channel)
{
	channel.send("Round has ended. Let's take a look at the scores.");
	
	var richest_player = new Objects.Player("Nobody", "Nobody");
	for (var i in players)
	{
		if (players[i].money >= richest_player.money)
		{
			richest_player = players[i];
		}
		
		channel.send(players[i].display_name + " has $" + players[i].money);
	}
	
	channel.send("The richest player is " + richest_player.display_name + 
				 " with $" + richest_player.money);
				 
	players = [];
}

function compareResponses(guess, answer)
{
	guess = getStrippedResponse(guess);
	answer = getStrippedResponse(answer);
	
	if (answer.length === guess.length)
	{
		var guess_split = guess.split("");
		var answer_split = answer.split("");
		
		var target_correctness = answer_split.length * 0.8;
		console.log(target_correctness);

		var correctness = 0;
		for (var i in guess_split)
		{
			if (guess_split[i] === answer_split[i])
			{
				correctness++;
			}
		}
		
		if (correctness > target_correctness)
		{
			return true;
		}
	}
	
	return false;
}

function getStrippedResponse(response)
{
	var stripped_response = response.toLowerCase();
	
	// Remove anything in parenthesis
	stripped_response = stripped_response.replace(/\s*\(.*?\)\s*/g, '');
	
	// Remove leading articles
	if (response.indexOf('the ') === 0)
	{
		stripped_response = stripped_response.substring(response.indexOf('e') + 1);
	}
	if (response.indexOf('a ') === 0)
	{
		stripped_response = stripped_response.substring(response.indexOf('a') + 1);
	}
	if (response.indexOf('an ') === 0)
	{
		stripped_response = stripped_response.substring(response.indexOf('n') + 1);
	}
	
	// Ignore spaces, ' " , ? ! .
	stripped_response = stripped_response.replace(/\s+/g, '');
	stripped_response = stripped_response.replace(/\'/g, '');
	stripped_response = stripped_response.replace(/\"/g, '');
	stripped_response = stripped_response.replace(/,/g, '');
	stripped_response = stripped_response.replace(/\?/g, '');
	stripped_response = stripped_response.replace(/!/g, '');
	stripped_response = stripped_response.replace(/\./g, '');

	console.log(response + " -> " + stripped_response);
	
	return stripped_response;
}

function judgeMode(message, display_name)
{
	var arguments = message.content.split(" ");
	
	if (arguments.length === 3)
	{
		players[parseInt(arguments[1])].money += parseInt(arguments[2]);
	}

	printPlayers(message.channel);
}

const Key = require('./Key.js');
client.login(Key.key);