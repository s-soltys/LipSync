package lipsync.player
{
	import flash.events.Event;
	import flash.utils.ByteArray;
	import lipsync.core.phoneme.Phoneme;
	/**
	 * ...
	 * @author Szymon
	 */
	public class LipsyncEvent extends Event
	{
		public static const AMPLITUDE_SAMPLE:String = "soundev_amplitude_sample";
		public static const PHONEME:String = "soundev_phoneme";
		public static const PLAYING_COMPLETE:String = "soundev_complete";
		public static const PLAYING_ERROR:String = "soundev_error";
		public static const PLAYING_START:String = "soundev_start";
		
		public var amplitude:Number;
		public var phoneme:Phoneme = Phoneme.NULL;
		
		public function LipsyncEvent(type:String, bubbles:Boolean = false, cancelable:Boolean = false){
            super(type, bubbles, cancelable);
		}
	}
}