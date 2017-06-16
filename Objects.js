exports.Player = function(tag, display_name)
{
	this.tag = tag;
	this.display_name = display_name;
	
	this.money = 0;
	this.eligible_to_answer = false;
}

exports.Clue = function(category, text, answer, value)
{
	this.category = category
	this.text = text;
	this.answer = answer;
	this.value = value;
	
	this.answered = false;
	
	console.log(this.category + " $" + this.value + ": " + this.text + " = " + this.answer);
}

exports.Command = function(description, invoke)
{
	this.description = description;
	this.invoke = invoke;
}
