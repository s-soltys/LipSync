import flash.display.Sprite;
import flash.events.Event;
import flash.events.TimerEvent;
import flash.utils.Timer;
import mx.rpc.events.ResultEvent;
import mx.controls.Alert;
import flash.display.Sprite;
import flash.events.Event;
import flash.events.MouseEvent;
import flash.net.FileReference;
import flash.net.URLLoader;
import flash.net.URLLoaderDataFormat;
import flash.net.URLRequest;
import flash.text.TextField;
import flash.utils.ByteArray;
import lipsync.core.LipsyncSettings;
import lipsync.core.lpc.LP;
import lipsync.core.network.NeuralNetwork;
import lipsync.core.phoneme.Phoneme;
import lipsync.core.phoneme.PhonemeCollection;
import lipsync.player.LipsyncPlayer;
import lipsync.player.LipsyncEvent;
import lipsync.training.generator.TrainingPatternGenerator;
import lipsync.training.TrainingPattern;

internal var targetMSE:Number;
internal var epochsToRun:int;
internal var learningRate:Number;
internal var hiddenLayers:int;
internal var hiddenNeuronsPerLayer:int;

internal var network:NeuralNetwork;
internal var trainer:TrainingPatternGenerator;
internal var trainingSequence:Vector.<TrainingPattern>;
internal var soundPlayer:LipsyncPlayer;
internal var totalTraining:Boolean = false;


	internal function init():void {
		setVariablesFunction();
		
		var inputNeurons:int = LP.order;
		var outputNeurons:int = LipsyncSettings.outputCount;
		
		network = new NeuralNetwork();
		network.createNetwork(inputNeurons, outputNeurons, hiddenNeuronsPerLayer);
		
		soundPlayer = new LipsyncPlayer(100, 1);
		soundPlayer.setupNeuralNetwork(network);
		soundPlayer.addEventListener(LipsyncEvent.PHONEME, onGetPhoneme);
		
		output.text = "";
		log.text = "";
	}

	internal function setVariablesFunction():void {
		targetMSE = new Number(targetMSEField.text);
		epochsToRun = new int(epochsField.text);
		learningRate = new Number(learningRateField.text);
		hiddenNeuronsPerLayer = new int(neuronsCountField.text);
		LipsyncSettings.recognizePhonemeDelay = new int(eventDelayField.text);
		LipsyncSettings.windowLength = new int(windowLengthField.text);
		LipsyncSettings.outputCount = new int(outputCountField.text);
		LipsyncSettings.samplingDecimate = new int(samplingDecimateField.text);
		LP.order = new int(lpcOrderField.text);
		
		/*
		trace(LipsyncSettings.lipsyncEventDelay);
		trace(LipsyncSettings.windowLength);
		trace(LipsyncSettings.outputCount);
		trace(LipsyncSettings.samplingDecimate);
		trace(LP.order);
		
		trace(targetMSE);
		trace(epochsToRun);
		trace(learningRate);
		trace(hiddenLayers);
		trace(hiddenNeuronsPerLayer);
		*/
	}


	internal function loadSamples():void {
		setVariablesFunction();
		
		var count:int = 40;
		var file:String;
		
		// FEMALE
		/*
		trainer = new TrainingPatternGenerator("../lib/female/");
		trainer.addEventListener(Event.COMPLETE, onTrainingSequence);
		
		file = "aeiou.mp3";
		trainer.addSequence(file, Phoneme.v3a, 8, 13, count);
		trainer.addSequence(file, Phoneme.v3b, 13, 20, count);
		trainer.addSequence(file, Phoneme.v7a, 42, 48, count);
		trainer.addSequence(file, Phoneme.v7b, 48, 54, count);
		trainer.addSequence(file, Phoneme.v2a, 78, 83, count);
		trainer.addSequence(file, Phoneme.v2b, 83, 89, count);
		trainer.addSequence(file, Phoneme.v6a, 111, 115, count);
		trainer.addSequence(file, Phoneme.v6b, 115, 122, count);
		trainer.addSequence(file, Phoneme.v5a, 145, 150, count);
		trainer.addSequence(file, Phoneme.v5b, 150, 158, count);
		
		file = "example.mp3";
		trainer.addSequence(file, Phoneme.v1a, 46, 50, count);
		trainer.addSequence(file, Phoneme.v1b, 50, 56, count);
		trainer.addSequence(file, Phoneme.v4a, 83, 85, count);
		trainer.addSequence(file, Phoneme.v4b, 85, 89, count);
		*/
		
		// MALE
		trainer = new TrainingPatternGenerator("../lib/male/");
		trainer.addEventListener(Event.COMPLETE, onTrainingSequence);
		
		file = "aeiou.mp3";
		trainer.addSequence(file, Phoneme.v3a, 9, 15, count);
		trainer.addSequence(file, Phoneme.v3b, 15, 24, count);
		trainer.addSequence(file, Phoneme.v7a, 50, 55, count);
		trainer.addSequence(file, Phoneme.v7b, 55, 62, count);
		trainer.addSequence(file, Phoneme.v1a, 87, 95, count);
		trainer.addSequence(file, Phoneme.v1b, 95, 102, count);
		trainer.addSequence(file, Phoneme.v6a, 127, 135, count);
		trainer.addSequence(file, Phoneme.v6b, 135, 144, count);
		trainer.addSequence(file, Phoneme.v5a, 167, 175, count);
		trainer.addSequence(file, Phoneme.v5b, 175, 187, count);
		
		file = "example.mp3";
		trainer.addSequence(file, Phoneme.v2a, 48, 53, count);
		trainer.addSequence(file, Phoneme.v2b, 53, 59, count);
		trainer.addSequence(file, Phoneme.v4a, 211, 218, count);
		trainer.addSequence(file, Phoneme.v4b, 218, 224, count);
		
		
		trainer.start();
	}

	internal function onTrainingSequence(evt:Event):void {
		trainingSequence = trainer.getSamples();
		
		if (totalTraining == false) {
			for each(var seq:TrainingPattern in trainingSequence) {
				//writeTo(output, seq.output + " - " + seq.input);
			}
			writeTo(log, "Training samples loaded", true);
		} else {
			partialTraining();
		}
	}
	

	internal function runNetwork(file:String = ""):void {
		output.text = "";
		
		setVariablesFunction();
		
		writeTo(log, "Run network. Test file: " + file, true);
		soundPlayer.playSound("../lib/"+file);

	}

	internal function trainNetwork():void {
		setVariablesFunction();
		
		writeTo(log, "Train network start", true);
		
		totalTraining = false;
		var mse:Number = network.train(trainingSequence, epochsToRun, learningRate);
		
		writeTo(log, "Training end. MSE: " + mse, true);
	}

	internal function completeTraining():void {
		setVariablesFunction();
		init();
		
		writeTo(log, "Complete training start", true);
		
		totalTraining = true;
		
		loadSamples();
	}

	internal function partialTraining():void {
		var mse:Number = network.train(trainingSequence, epochsToRun, learningRate, targetMSE);
		
		if (mse <= targetMSE) {
			writeTo(log, "Total training complete. MSE: " + mse, true);
		} else {
			writeTo(log, ""+mse, false);
			loadSamples();
		}
	}
	
	
	internal function saveNetwork():void {
		var fr:FileReference = new FileReference();
		fr.save(network.save(), "network_image");
		writeTo(log, "Save neural network", true);
	}

	internal function loadNetwork():void {
		function onOpen(evt:Event):void {
			var ba:ByteArray = evt.target.data
			network.load(ba);
			writeTo(log, "Neural network loaded", true);
			
			windowLengthField.text = "" + LipsyncSettings.windowLength;
			outputCountField.text = "" + LipsyncSettings.outputCount;
			lpcOrderField.text = "" + LP.order;
			samplingDecimateField.text = "" + LipsyncSettings.samplingDecimate;
		}
		
		var loader:URLLoader = new URLLoader();
		loader.addEventListener(Event.COMPLETE, onOpen);
		loader.dataFormat = URLLoaderDataFormat.BINARY;
		loader.load(new URLRequest("../lib/network_image"));
	}

	internal function clearNetwork():void {
		init();
		output.text = "";
		log.text = "";
	}


	internal function onGetPhoneme(event:LipsyncEvent):void {
		var phoneme:Phoneme = event.phoneme;
		
		writeTo(output, " " + phoneme.symbol, false, false);
		phonemeLabel.text = phoneme.symbol;
	}

	internal function writeTo(obj:mx.controls.TextArea, text:String, date:Boolean = false, ln:Boolean = true):void {
		if (date) {
			var split:Array = (new Date().toTimeString().split(" ")[0]).split(":");
			obj.text += "[" + split[1] + ":" + split[2] + "] - ";
		}
		
		obj.text += text;
		
		if (ln) {
			obj.text += "\n";
		}
	}

