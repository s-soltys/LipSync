package lipsync.training.generator
{
	import flash.events.Event;
	import lipsync.core.phoneme.Phoneme;
	/**
	 * ...
	 * @author S
	 */
	public class ProviderEvent extends Event
	{
		internal static const TRAINING_SEQ:String = "training_seq";
		
		internal var phoneme:Phoneme;
		internal var sampleArraySet:Array;
		
		public function ProviderEvent(type:String, bubbles:Boolean = false, cancelable:Boolean = false){
            super(type, bubbles, cancelable);
		}
		
	}

}