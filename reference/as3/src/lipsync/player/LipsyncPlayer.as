package lipsync.player
{
	import flash.events.Event;
	import flash.events.EventDispatcher;
	import flash.events.IOErrorEvent;
	import flash.events.TimerEvent;
	import flash.media.Sound;
	import flash.media.SoundChannel;
	import flash.media.SoundTransform;
	import flash.net.URLRequest;
	import flash.utils.ByteArray;
	import flash.utils.Timer;
	import lipsync.core.LipsyncSettings;
	import lipsync.core.lpc.LP;
	import lipsync.core.network.NeuralNetwork;
	import lipsync.core.phoneme.Phoneme;
	import lipsync.core.phoneme.PhonemeCollection;
	
	/**
	 * ...
	 * @author Szymon
	 */
	
	public class LipsyncPlayer extends EventDispatcher {
		private var network:NeuralNetwork;
		
		private var phonemePositionStep:int;
		private var phonemeBufferArray:Array;
		
		private var soundVolume:Number;
		private var soundEnabled:Boolean;
		private var soundIsPlaying:Boolean;
		
		private var soundsArray:Array;
		private var sound:Sound;
		private var soundChannel:SoundChannel;
		private var soundTransform:SoundTransform;
		
		private var dispatchEventTimer:Timer;
		private var dispatchEventDelay:int;
		
		private var recognizePhonemeTimer:Timer;
		
		
		// SETUP
		public function LipsyncPlayer(dispatchDelay:int, init_volume:Number = 1.0) {
			this.dispatchEventDelay = dispatchDelay;
			
			soundEnabled = true;
			soundIsPlaying = false;
			
			soundTransform = new SoundTransform(1.00);
			
			this.setSoundVolume(init_volume);
		}
		
		public function setupNeuralNetwork(network:NeuralNetwork):void {
			this.network = network;
		}
		
		
		// VOLUME
		public function isSoundEnabled():Boolean {
			return soundEnabled;
		}
		
		public function isSoundPlaying():Boolean {
			return soundIsPlaying;
		}
		
		public function setSoundVolume(volume:Number):void {
			if (volume != 0.00) {
				volume = Math.max(volume, 0.00);
				volume = Math.min(volume, 1.00);
				
				soundTransform.volume = volume;
			
				soundEnabled = true;
			}
			else {
				soundTransform.volume = 0.00;
				soundEnabled = false;
			}
			
			
			if ( soundIsPlaying == false ) return;
			else try{
					var soundPosition:Number = soundChannel.position;
					soundChannel.stop();
					soundChannel = sound.play(soundPosition, 0, soundTransform);
				}
				catch(e:Error){ trace("Error - turning on sound"); }
			
		}
		
		public function getSoundVolume():Number {
			return soundTransform.volume;
		}
		
		
		// BASE
		public function playSounds(soundsArray:Array):void {
			this.soundsArray = soundsArray;
			
			if (soundIsPlaying == true) {
				soundPlayComplete();
			}
			
			playNextSound();
		}
		
		public function playSound(url:String):void {
			playSounds(new Array(url));
		}
		
		public function stopPlaying():void {
			soundsArray = [];
			
			if( soundIsPlaying == true )
				soundPlayComplete(null);
		}
		
		
		// SOUND HANDLING
		private function playNextSound():void {
			if (soundsArray.length == 0) return;
			
			var url:String = soundsArray[0];
			soundsArray.splice(0, 1);
			
			try {
				var urlReq:URLRequest = new URLRequest(url);
				
				sound = new Sound();
				sound.addEventListener(Event.COMPLETE, soundLoaded);
				sound.addEventListener(IOErrorEvent.IO_ERROR, soundLoadError);
				sound.load(urlReq);
			} catch (error:Error){
				return;
			}
		}
		
		private function soundLoaded(event:Event):void {
			sound.removeEventListener(Event.COMPLETE, soundLoaded);
			
			preparePhonemeBuffer();
			
			try {
				soundChannel = sound.play(0,0, soundTransform);
			} catch(error:Error){
				soundChannel.stop();
				return;
			}
			
			soundIsPlaying = true;
			
			dispatchEventTimer = new Timer(dispatchEventDelay, 0);
			dispatchEventTimer.addEventListener(TimerEvent.TIMER, dispatchSoundEvent);
			dispatchEventTimer.start();
			
			recognizePhonemeTimer = new Timer(LipsyncSettings.recognizePhonemeDelay, 0);
			recognizePhonemeTimer.addEventListener(TimerEvent.TIMER, recognizeLipsyncEvent);
			recognizePhonemeTimer.start();
			
			soundChannel.addEventListener(Event.SOUND_COMPLETE, soundPlayComplete);
			
			var soundEvent:LipsyncEvent = new LipsyncEvent(LipsyncEvent.PLAYING_START);
			dispatchEvent(soundEvent);
			
			dispatchSoundEvent(null);
		}
		
		private function soundLoadError(event:Event):void {
			sound.removeEventListener(IOErrorEvent.IO_ERROR, soundLoadError);
			playNextSound();
		}
		
		private function soundPlayComplete(event:Event = null):void {
			soundChannel.removeEventListener(Event.SOUND_COMPLETE, soundPlayComplete);
			dispatchEventTimer.removeEventListener(TimerEvent.TIMER, dispatchSoundEvent);
			recognizePhonemeTimer.removeEventListener(TimerEvent.TIMER, recognizeLipsyncEvent);
			
			dispatchEventTimer.stop();
			
			soundChannel.stop();
			sound = null;
			
			if (soundsArray.length != 0)
				playNextSound();
			else {
				soundIsPlaying = false;
				
				var soundEvent:LipsyncEvent = new LipsyncEvent(LipsyncEvent.PLAYING_COMPLETE);
				dispatchEvent(soundEvent);
			}
		}
		
		private function dispatchSoundEvent(event:Event):void {
			var soundEvent:LipsyncEvent = new LipsyncEvent(LipsyncEvent.AMPLITUDE_SAMPLE);
			soundEvent.amplitude = 0.5 * (soundChannel.leftPeak + soundChannel.rightPeak);
			dispatchEvent(soundEvent);
		}
		
		
		// LIPSYNC
		private function preparePhonemeBuffer():void {
			phonemePositionStep = LipsyncSettings.recognizePhonemeDelay * LipsyncSettings.samplingRateMS;
			
			phonemeBufferArray = new Array();
			for (var position:int = phonemePositionStep; position < (sound.length * LipsyncSettings.samplingRateMS); position+=phonemePositionStep) {
				var phoneme:LipsyncBufferItem = recognizePhoneme(position);
				phonemeBufferArray.push(phoneme);
			}
			
			setupBuffer();
		}
		
		private function setupBuffer():void {
			var f:LipsyncBufferItem;
			var c:LipsyncBufferItem;
			var s:LipsyncBufferItem;
			
			for (var i:int = 1; i < phonemeBufferArray.length - 1; i++) {
				f = phonemeBufferArray[i - 1];
				c = phonemeBufferArray[i];
				s = phonemeBufferArray[i + 1];
				
				if (c.phoneme != f.phoneme && c.phoneme != s.phoneme) {
					if (s.phoneme != Phoneme.NULL) {
						c.phoneme = s.phoneme;
					} else if (f.phoneme != Phoneme.NULL) {
						c.phoneme = f.phoneme;
					}
				}
			}
			
		}
		
		private function recognizeLipsyncEvent(event:Event):void {
			var position:int = (soundChannel.position * LipsyncSettings.samplingRateMS);
			var item:LipsyncBufferItem = null;
			
			do {
				item = phonemeBufferArray.shift();
				if (item == null) item = new LipsyncBufferItem();
			} while ((item.position + phonemePositionStep) < position);
			
			//item = recognizePhoneme(position);
			
			var soundEvent:LipsyncEvent = new LipsyncEvent(LipsyncEvent.PHONEME);
			soundEvent.phoneme = item.phoneme;
			soundEvent.amplitude = item.energy;
			dispatchEvent(soundEvent);
		}
		
		private function recognizePhoneme(position:int):LipsyncBufferItem {
			var item:LipsyncBufferItem = extractSound(position);
			
			if (item.energy >= LipsyncSettings.activationEnergy) {
				var K:Vector.<Number> = LP.analyze(item.samples);
				var result:Vector.<Number> = network.run(K);
				item.phoneme = PhonemeCollection.arrayToPhoneme(result);
			}
			
			return item;
		}
		
		private function extractSound(position:int):LipsyncBufferItem {
			var buffer:ByteArray = new ByteArray();
			sound.extract(buffer, LipsyncSettings.windowLength * LipsyncSettings.samplingRateMS, position);
			buffer.position = 0;
			
			var offset:int = 4 * (LipsyncSettings.samplingDecimate + 1);
			var samples:Vector.<Number> = new Vector.<Number>();
			
			var energy:Number = 0.0;
			var sample:Number = 0.0;
			while (buffer.bytesAvailable > 0) {
				sample = buffer.readFloat();
				samples.push(sample);
				buffer.position += offset;
				
				if (sample < 0) energy -= sample;
				else energy += sample;
				
			}
			energy /= samples.length;
			
			var item:LipsyncBufferItem = new LipsyncBufferItem();
			item.position = position;
			item.energy = energy;
			item.samples = samples;
			
			return item;
		}
		
	}
}